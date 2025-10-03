import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { getDb } from '../db/database.js';
import { config } from '../config.js';
import { ensureDefaultUser } from './userService.js';
import { getChineseSupplement, getEnglishMetadata, extractWordFromImage } from './geminiService.js';
import { synthesizeSpeech } from './azureSpeechService.js';
import { scheduleInitialReview } from './schedulerService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

export const uploadMiddleware = upload.single('image');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function persistUpload(buffer, originalname) {
  ensureDir(config.uploadsDir);
  const timestamp = Date.now();
  const ext = path.extname(originalname || '') || '.jpg';
  const filename = `${timestamp}-${Math.random().toString(36).slice(2)}${ext}`;
  const targetPath = path.join(config.uploadsDir, filename);
  fs.writeFileSync(targetPath, buffer);
  console.info('[wordService] stored upload', targetPath);
  return targetPath;
}

const audioDir = path.join(config.uploadsDir, 'audio');

function toPublicUrl(filePath) {
  const relative = path.relative(config.uploadsDir, filePath).split(path.sep).join('/');
  return `/uploads/${relative}`;
}

function resolveAudioPath(audioUrl) {
  if (!audioUrl) return null;
  if (/^https?:/i.test(audioUrl)) return null;
  if (audioUrl.startsWith(config.uploadsDir)) {
    return audioUrl;
  }
  const cleaned = audioUrl.replace(/^\/uploads\//, '');
  return path.join(config.uploadsDir, cleaned);
}

async function ensureWordPronunciation({ id, lemma, audio_url: audioUrl }) {
  const existing = resolveAudioPath(audioUrl);
  if (existing && fs.existsSync(existing)) {
    return { filePath: existing, publicUrl: audioUrl };
  }
  ensureDir(audioDir);
  const filePath = await synthesizeSpeech({ text: lemma, cachePrefix: `word-${id}` });
  const publicUrl = toPublicUrl(filePath);
  const db = getDb();
  db.prepare('UPDATE words SET audio_url = ? WHERE id = ?').run(publicUrl, id);
  return { filePath, publicUrl };
}

async function ensureTextToSpeech({ wordId, text, prefix }) {
  if (!text) return null;
  ensureDir(audioDir);
  const filePath = await synthesizeSpeech({ text, cachePrefix: `${prefix}-${wordId}` });
  return {
    filePath,
    publicUrl: toPublicUrl(filePath)
  };
}

function upsertWord({ userId, lemma, imagePath = null, audioUrl = null }) {
  const db = getDb();
  const normalized = lemma.trim().toLowerCase();
  const existing = db.prepare('SELECT * FROM words WHERE user_id = ? AND lemma = ?').get(userId, normalized);
  if (existing) {
    if (imagePath && !existing.image_path) {
      db.prepare('UPDATE words SET image_path = ? WHERE id = ?').run(imagePath, existing.id);
      console.info('[wordService] updated image path for existing word', existing.id);
    }
    return existing;
  }

  const info = db.prepare(`
    INSERT INTO words(user_id, lemma, image_path, audio_url)
    VALUES (?, ?, ?, ?)
  `).run(userId, normalized, imagePath, audioUrl);

  const created = db.prepare('SELECT * FROM words WHERE id = ?').get(info.lastInsertRowid);
  console.info('[wordService] created new word', { id: created.id, lemma: created.lemma });
  return created;
}

export async function ingestWordFromImage({ buffer, originalname, mimetype }) {
  const user = ensureDefaultUser();
  const storedPath = persistUpload(buffer, originalname);

  const ocrResults = await extractWordFromImage({
    buffer,
    filename: originalname,
    mimetype
  });
  if (!ocrResults.length) {
    console.warn('[wordService] OCR returned empty result set');
    throw new Error('Unable to extract word from image');
  }

  const processed = [];
  const seen = new Set();

  for (const { lemma, confidence } of ocrResults) {
    if (seen.has(lemma)) {
      console.info('[wordService] skipping duplicate lemma from OCR', lemma);
      continue;
    }
    seen.add(lemma);
    const word = upsertWord({ userId: user.id, lemma, imagePath: storedPath });
    console.info('[wordService] extracted lemma from image', { lemma, confidence });
    await ensureMetadata(word.id, { lemma: word.lemma });
    const metadata = await ensureChineseSupplement(word.id);
    const pronunciation = await ensureWordPronunciation({ id: word.id, lemma: word.lemma, audio_url: word.audio_url });
    scheduleInitialReview({ wordId: word.id, userId: user.id });
    processed.push({
      id: word.id,
      lemma: word.lemma,
      imagePath: word.image_path,
      createdAt: word.created_at,
      audioUrl: pronunciation.publicUrl,
      confidence,
      enDefinition: metadata.en_definition,
      enExample: metadata.en_example,
      zhDefinition: metadata.zh_definition,
      zhExample: metadata.zh_example
    });
  }

  return { words: processed };
}

export async function ingestWordManually({ lemma }) {
  if (!lemma || !lemma.trim()) throw new Error('Word is required');
  const user = ensureDefaultUser();
  const word = upsertWord({ userId: user.id, lemma });
  await ensureMetadata(word.id, { lemma: word.lemma });
  const metadata = await ensureChineseSupplement(word.id);
  const pronunciation = await ensureWordPronunciation({ id: word.id, lemma: word.lemma, audio_url: word.audio_url });
  scheduleInitialReview({ wordId: word.id, userId: user.id });
  return {
    id: word.id,
    lemma: word.lemma,
    createdAt: word.created_at,
    audioUrl: pronunciation.publicUrl,
    enDefinition: metadata.en_definition,
    enExample: metadata.en_example,
    zhDefinition: metadata.zh_definition,
    zhExample: metadata.zh_example
  };
}

export async function ensureMetadata(wordId, { lemma }) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM word_metadata WHERE word_id = ?').get(wordId);
  if (existing) return existing;

  const englishMeta = await getEnglishMetadata(lemma);
  console.info('[wordService] fetched english metadata', { wordId, lemma });
  
  // 预生成所有音频文件
  console.info('[wordService] pre-generating all audio files', { wordId, lemma });
  const [defAudio, exampleAudio] = await Promise.all([
    ensureTextToSpeech({ wordId, text: englishMeta.definition, prefix: 'definition' }),
    ensureTextToSpeech({ wordId, text: englishMeta.example, prefix: 'example' })
  ]);

  db.prepare(`
    INSERT INTO word_metadata(word_id, en_definition, en_example, en_definition_audio_url, en_example_audio_url, gemini_model)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(wordId, englishMeta.definition, englishMeta.example, defAudio?.publicUrl, exampleAudio?.publicUrl, config.gemini.model);

  return db.prepare('SELECT * FROM word_metadata WHERE word_id = ?').get(wordId);
}

export async function ensureChineseSupplement(wordId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT w.lemma, m.*
    FROM word_metadata m
    JOIN words w ON w.id = m.word_id
    WHERE m.word_id = ?
  `).get(wordId);
  if (!row) throw new Error('Metadata missing');
  if (row.zh_definition && row.zh_example) return row;

  const zh = await getChineseSupplement(row.lemma, {
    definition: row.en_definition,
    example: row.en_example
  });

  db.prepare(`
    UPDATE word_metadata
    SET zh_definition = ?, zh_example = ?, updated_at = CURRENT_TIMESTAMP
    WHERE word_id = ?
  `).run(zh.definition, zh.example, wordId);
  console.info('[wordService] enriched chinese metadata', { wordId });

  return db.prepare(`
    SELECT w.lemma, m.*
    FROM word_metadata m
    JOIN words w ON w.id = m.word_id
    WHERE m.word_id = ?
  `).get(wordId);
}

export function getWordWithMetadata(wordId) {
  const db = getDb();
  return db.prepare(`
    SELECT w.*, m.en_definition AS enDefinition, m.en_example AS enExample,
           m.zh_definition AS zhDefinition, m.zh_example AS zhExample
    FROM words w
    LEFT JOIN word_metadata m ON m.word_id = w.id
    WHERE w.id = ?
  `).get(wordId);
}

export function listWordsWithMetadata({ userId, limit = 500 }) {
  const db = getDb();
  return db.prepare(`
    SELECT w.id, w.lemma, w.audio_url AS audioUrl, w.image_path AS imagePath,
           w.created_at AS createdAt,
           m.en_definition AS enDefinition, m.en_example AS enExample,
           m.zh_definition AS zhDefinition, m.zh_example AS zhExample,
           m.en_definition_audio_url AS enDefinitionAudioUrl,
           m.en_example_audio_url AS enExampleAudioUrl,
           m.gemini_model AS geminiModel
    FROM words w
    LEFT JOIN word_metadata m ON m.word_id = w.id
    WHERE w.user_id = ?
    ORDER BY w.created_at DESC
    LIMIT ?
  `).all(userId, limit);
}

export async function ensureWordAudioUrl(wordId) {
  const db = getDb();
  const word = db.prepare('SELECT id, lemma, audio_url FROM words WHERE id = ?').get(wordId);
  if (!word) throw new Error('Word not found');
  const audio = await ensureWordPronunciation(word);
  return audio.publicUrl;
}

export async function ensureDefinitionAudioUrl(wordId) {
  const db = getDb();
  const row = db.prepare('SELECT en_definition_audio_url, en_definition FROM word_metadata WHERE word_id = ?').get(wordId);
  if (!row?.en_definition) return null;
  
  // 如果已有预生成的音频URL，直接返回
  if (row.en_definition_audio_url) {
    return row.en_definition_audio_url;
  }
  
  // 如果没有，临时生成（向后兼容）
  const audio = await ensureTextToSpeech({ wordId, text: row.en_definition, prefix: 'definition' });
  if (audio?.publicUrl) {
    // 保存到数据库以便下次使用
    db.prepare('UPDATE word_metadata SET en_definition_audio_url = ? WHERE word_id = ?').run(audio.publicUrl, wordId);
  }
  return audio?.publicUrl;
}

export async function ensureExampleAudioUrl(wordId) {
  const db = getDb();
  const row = db.prepare('SELECT en_example_audio_url, en_example FROM word_metadata WHERE word_id = ?').get(wordId);
  if (!row?.en_example) return null;
  
  // 如果已有预生成的音频URL，直接返回
  if (row.en_example_audio_url) {
    return row.en_example_audio_url;
  }
  
  // 如果没有，临时生成（向后兼容）
  const audio = await ensureTextToSpeech({ wordId, text: row.en_example, prefix: 'example' });
  if (audio?.publicUrl) {
    // 保存到数据库以便下次使用
    db.prepare('UPDATE word_metadata SET en_example_audio_url = ? WHERE word_id = ?').run(audio.publicUrl, wordId);
  }
  return audio?.publicUrl;
}
