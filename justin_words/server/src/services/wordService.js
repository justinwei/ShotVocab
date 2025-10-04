import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { getDb } from '../db/database.js';
import { config } from '../config.js';
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
const PREVIEW_TTL_MS = 10 * 60 * 1000;

const pendingImageImports = new Map();

function cleanupExpiredPreviews(now = Date.now()) {
  for (const [key, entry] of pendingImageImports.entries()) {
    if (now - entry.createdAt > PREVIEW_TTL_MS) {
      pendingImageImports.delete(key);
      if (entry.imagePath) {
        removeFileIfExists(entry.imagePath);
      }
    }
  }
}

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

function removeFileIfExists(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn('[wordService] failed to remove file', filePath, error.message);
  }
}

async function ensureWordPronunciation(word, { force = false } = {}) {
  const existingPath = resolveAudioPath(word.audio_url);
  if (!force && existingPath && fs.existsSync(existingPath)) {
    return { filePath: existingPath, publicUrl: word.audio_url };
  }

  if (force && existingPath) {
    removeFileIfExists(existingPath);
  }

  ensureDir(audioDir);
  const filePath = await synthesizeSpeech({ text: word.lemma, cachePrefix: `word-${word.id}` });
  const publicUrl = toPublicUrl(filePath);
  const db = getDb();
  db.prepare('UPDATE words SET audio_url = ? WHERE id = ?').run(publicUrl, word.id);
  return { filePath, publicUrl };
}

async function ensureTextToSpeech({ wordId, text, prefix, existingUrl, force = false }) {
  if (!text) return null;
  ensureDir(audioDir);
  const existingPath = resolveAudioPath(existingUrl);
  if (force && existingPath) {
    removeFileIfExists(existingPath);
  }
  const filePath = await synthesizeSpeech({ text, cachePrefix: `${prefix}-${wordId}` });
  return {
    filePath,
    publicUrl: toPublicUrl(filePath)
  };
}

function upsertWord({ userId, lemma, imagePath = null }) {
  const db = getDb();
  const normalized = lemma.trim().toLowerCase();
  if (!normalized) {
    throw new Error('Word is required');
  }
  const existing = db.prepare('SELECT * FROM words WHERE user_id = ? AND lemma = ?').get(userId, normalized);
  if (existing) {
    if (imagePath && !existing.image_path) {
      db.prepare('UPDATE words SET image_path = ? WHERE id = ?').run(imagePath, existing.id);
      console.info('[wordService] updated image path for existing word', existing.id);
      existing.image_path = imagePath;
    }
    return existing;
  }

  const info = db.prepare(`
    INSERT INTO words(user_id, lemma, image_path)
    VALUES (?, ?, ?)
  `).run(userId, normalized, imagePath);

  const created = db.prepare('SELECT * FROM words WHERE id = ?').get(info.lastInsertRowid);
  console.info('[wordService] created new word', { id: created.id, lemma: created.lemma });
  return created;
}

export async function ensureMetadata(wordId, { lemma, force = false, skipAudio = false }) {
  if (!lemma) throw new Error('Lemma is required for metadata');
  const db = getDb();
  const existing = db.prepare('SELECT * FROM word_metadata WHERE word_id = ?').get(wordId);
  if (existing && !force) return existing;

  const englishMeta = await getEnglishMetadata(lemma, { force });
  console.info('[wordService] fetched english metadata', { wordId, lemma });

  let defAudio = null;
  let exampleAudio = null;
  if (!skipAudio) {
    defAudio = await ensureTextToSpeech({
      wordId,
      text: englishMeta.definition,
      prefix: 'definition',
      existingUrl: existing?.en_definition_audio_url,
      force
    });
    exampleAudio = await ensureTextToSpeech({
      wordId,
      text: englishMeta.example,
      prefix: 'example',
      existingUrl: existing?.en_example_audio_url,
      force
    });
  }

  if (existing) {
    db.prepare(`
      UPDATE word_metadata
      SET en_definition = ?,
          en_example = ?,
          en_definition_audio_url = ?,
          en_example_audio_url = ?,
          gemini_model = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE word_id = ?
    `).run(
      englishMeta.definition,
      englishMeta.example,
      skipAudio ? existing.en_definition_audio_url : (defAudio?.publicUrl || existing.en_definition_audio_url),
      skipAudio ? existing.en_example_audio_url : (exampleAudio?.publicUrl || existing.en_example_audio_url),
      config.gemini.model,
      wordId
    );
  } else {
    db.prepare(`
      INSERT INTO word_metadata(word_id, en_definition, en_example, en_definition_audio_url, en_example_audio_url, gemini_model)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      wordId,
      englishMeta.definition,
      englishMeta.example,
      defAudio?.publicUrl || existing?.en_definition_audio_url || null,
      exampleAudio?.publicUrl || existing?.en_example_audio_url || null,
      config.gemini.model
    );
  }

  return db.prepare('SELECT * FROM word_metadata WHERE word_id = ?').get(wordId);
}

export async function ensureChineseSupplement(wordId, { force = false } = {}) {
  const db = getDb();
  const row = db.prepare(`
    SELECT w.lemma, m.*
    FROM word_metadata m
    JOIN words w ON w.id = m.word_id
    WHERE m.word_id = ?
  `).get(wordId);
  if (!row) throw new Error('Metadata missing');
  if (!force && row.zh_definition && row.zh_example) return row;

  const zh = await getChineseSupplement(
    row.lemma,
    {
      definition: row.en_definition,
      example: row.en_example
    },
    { force }
  );

  db.prepare(`
    UPDATE word_metadata
    SET zh_definition = ?,
        zh_example = ?,
        updated_at = CURRENT_TIMESTAMP
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

function mapWordResponse(wordRow, metadataRow, { confidence } = {}) {
  return {
    id: wordRow.id,
    lemma: wordRow.lemma,
    imagePath: wordRow.image_path,
    createdAt: wordRow.created_at,
    audioUrl: wordRow.audio_url,
    confidence,
    enDefinition: metadataRow?.en_definition,
    enExample: metadataRow?.en_example,
    zhDefinition: metadataRow?.zh_definition,
    zhExample: metadataRow?.zh_example,
    enDefinitionAudioUrl: metadataRow?.en_definition_audio_url,
    enExampleAudioUrl: metadataRow?.en_example_audio_url
  };
}

async function enrichWord({ word, confidence, options = {} }) {
  const metadata = await ensureMetadata(word.id, {
    lemma: word.lemma,
    force: options.forceMetadata,
    skipAudio: options.skipAudio
  });
  const zhMetadata = await ensureChineseSupplement(word.id, { force: options.forceChinese });
  if (!options.skipAudio) {
    await ensureWordPronunciation(word, { force: options.forceAudio });
  }

  const db = getDb();
  const refreshedWord = db.prepare('SELECT * FROM words WHERE id = ?').get(word.id);
  scheduleInitialReview({ wordId: refreshedWord.id, userId: refreshedWord.user_id });
  const metadataRow = db.prepare('SELECT * FROM word_metadata WHERE word_id = ?').get(word.id);
  return mapWordResponse(refreshedWord, metadataRow ?? { ...metadata, ...zhMetadata }, { confidence });
}

export async function ingestImageForUser({ userId, buffer, originalname, mimetype, onProgress }) {
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

  onProgress?.({ type: 'ocr', words: ocrResults });

  const processed = [];
  const seen = new Set();

  for (const { lemma, confidence } of ocrResults) {
    const normalized = lemma.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      console.info('[wordService] skipping duplicate lemma from OCR', normalized);
      continue;
    }
    seen.add(normalized);
    onProgress?.({ type: 'processing', lemma: normalized, confidence });
    const word = upsertWord({ userId, lemma: normalized, imagePath: storedPath });
    const enriched = await enrichWord({ word, confidence });
    processed.push(enriched);
    onProgress?.({ type: 'completed', word: enriched });
  }

  return processed;
}

export async function ingestWordsManually({ userId, lemmas }) {
  const results = [];
  const seen = new Set();
  for (const rawLemma of lemmas) {
    const normalized = rawLemma?.trim().toLowerCase();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    const word = upsertWord({ userId, lemma: normalized });
    const enriched = await enrichWord({ word });
    results.push(enriched);
  }
  if (!results.length) {
    throw new Error('No valid words provided');
  }
  return results;
}

export async function createImagePreview({ userId, buffer, originalname, mimetype }) {
  if (!buffer?.length) throw new Error('Image buffer is required');
  cleanupExpiredPreviews();

  const storedPath = persistUpload(buffer, originalname);

  const ocrResults = await extractWordFromImage({
    buffer,
    filename: originalname,
    mimetype
  });

  if (!ocrResults.length) {
    throw new Error('Unable to extract word from image');
  }

  const normalized = [];
  const seen = new Set();
  for (const { lemma, confidence } of ocrResults) {
    const cleaned = lemma?.trim().toLowerCase();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    normalized.push({ lemma: cleaned, confidence: confidence ?? null });
  }

  if (!normalized.length) {
    throw new Error('Unable to extract word from image');
  }

  const uploadId = crypto.randomUUID();
  pendingImageImports.set(uploadId, {
    userId,
    imagePath: storedPath,
    originalname,
    words: new Map(normalized.map((item) => [item.lemma, item])),
    createdAt: Date.now()
  });

  return {
    uploadId,
    words: normalized
  };
}

export async function confirmImageImport({ uploadId, userId, lemmas, finalize = true }) {
  cleanupExpiredPreviews();
  const entry = pendingImageImports.get(uploadId);
  if (!entry || entry.userId !== userId) {
    throw new Error('Upload session not found');
  }

  try {
    const selected = [];
    const seen = new Set();
    for (const raw of lemmas || []) {
      const cleaned = raw?.toString().trim().toLowerCase();
      if (!cleaned || seen.has(cleaned)) continue;
      if (!entry.words.has(cleaned)) continue;
      seen.add(cleaned);
      selected.push(cleaned);
    }

    if (!selected.length) {
      throw new Error('No valid words selected');
    }

    const results = [];
    for (const lemma of selected) {
      const confidence = entry.words.get(lemma)?.confidence ?? null;
      const word = upsertWord({ userId, lemma, imagePath: entry.imagePath });
      const enriched = await enrichWord({
        word,
        confidence,
        options: {
          forceMetadata: true,
          forceChinese: true
        }
      });
      results.push(enriched);
    }

    for (const lemma of selected) {
      entry.words.delete(lemma);
    }

    const shouldFinalize = finalize || entry.words.size === 0;
    if (shouldFinalize) {
      pendingImageImports.delete(uploadId);
    }

    return results;
  } catch (error) {
    throw error;
  }
}

export function discardImagePreview({ uploadId, userId }) {
  cleanupExpiredPreviews();
  const entry = pendingImageImports.get(uploadId);
  if (!entry || entry.userId !== userId) {
    return false;
  }
  pendingImageImports.delete(uploadId);
  if (entry.imagePath) {
    removeFileIfExists(entry.imagePath);
  }
  return true;
}

export function getWordWithMetadata(wordId, userId) {
  const db = getDb();
  return db.prepare(`
    SELECT w.*, m.en_definition AS enDefinition, m.en_example AS enExample,
           m.zh_definition AS zhDefinition, m.zh_example AS zhExample,
           m.en_definition_audio_url AS enDefinitionAudioUrl,
           m.en_example_audio_url AS enExampleAudioUrl
    FROM words w
    LEFT JOIN word_metadata m ON m.word_id = w.id
    WHERE w.id = ? AND w.user_id = ?
  `).get(wordId, userId);
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

export async function ensureWordAudioUrl(wordId, userId) {
  const db = getDb();
  const word = db.prepare('SELECT * FROM words WHERE id = ? AND user_id = ?').get(wordId, userId);
  if (!word) throw new Error('Word not found');
  const audio = await ensureWordPronunciation(word);
  return audio.publicUrl;
}

export async function ensureDefinitionAudioUrl(wordId, userId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT m.en_definition_audio_url, m.en_definition
    FROM word_metadata m
    JOIN words w ON w.id = m.word_id
    WHERE m.word_id = ? AND w.user_id = ?
  `).get(wordId, userId);
  if (!row?.en_definition) return null;

  if (row.en_definition_audio_url) {
    return row.en_definition_audio_url;
  }

  const audio = await ensureTextToSpeech({ wordId, text: row.en_definition, prefix: 'definition', existingUrl: row.en_definition_audio_url });
  if (audio?.publicUrl) {
    db.prepare('UPDATE word_metadata SET en_definition_audio_url = ? WHERE word_id = ?').run(audio.publicUrl, wordId);
  }
  return audio?.publicUrl || null;
}

export async function ensureExampleAudioUrl(wordId, userId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT m.en_example_audio_url, m.en_example
    FROM word_metadata m
    JOIN words w ON w.id = m.word_id
    WHERE m.word_id = ? AND w.user_id = ?
  `).get(wordId, userId);
  if (!row?.en_example) return null;

  if (row.en_example_audio_url) {
    return row.en_example_audio_url;
  }

  const audio = await ensureTextToSpeech({ wordId, text: row.en_example, prefix: 'example', existingUrl: row.en_example_audio_url });
  if (audio?.publicUrl) {
    db.prepare('UPDATE word_metadata SET en_example_audio_url = ? WHERE word_id = ?').run(audio.publicUrl, wordId);
  }
  return audio?.publicUrl || null;
}

export async function regenerateWordResources({ userId, wordId }) {
  const db = getDb();
  const word = db.prepare('SELECT * FROM words WHERE id = ? AND user_id = ?').get(wordId, userId);
  if (!word) {
    throw new Error('Word not found');
  }
  const refreshed = await enrichWord({
    word,
    options: {
      forceMetadata: true,
      forceChinese: true,
      skipAudio: true
    }
  });
  return refreshed;
}
