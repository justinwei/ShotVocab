import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const cacheDir = path.join(config.uploadsDir, '.cache');
const DEFAULT_MIME = 'image/jpeg';
const MOCK_OCR_RESPONSE = () => [
  {
    lemma: 'example',
    confidence: 0.42
  }
];
const MOCK_EN_METADATA = (word) => ({
  definition: `${word} is a placeholder definition generated for development.`,
  example: `This is an example sentence using the word ${word}.`
});
const MOCK_ZH_METADATA = (word) => ({
  definition: `${word} 的占位中文释义，用于开发阶段。`,
  example: `这里是包含 ${word} 的中文示例句。`
});

let client = null;
let googleModulePromise = null;

function ensureCacheDir() {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
}



function cacheKey(prefix, payload) {
  return path.join(cacheDir, `${prefix}-${crypto.createHash('sha1').update(payload).digest('hex')}.json`);
}

function readCache(key) {
  try {
    return JSON.parse(fs.readFileSync(key, 'utf-8'));
  } catch (_) {
    return null;
  }
}

function writeCache(key, value) {
  fs.writeFileSync(key, JSON.stringify(value, null, 2));
}

function shouldUseMock() {
  return !config.gemini.apiKey || process.env.GEMINI_FORCE_MOCK === '1';
}

function getMimeFromFilename(filename) {
  if (!filename) return DEFAULT_MIME;
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.heic':
    case '.heif':
      return 'image/heic';
    case '.bmp':
      return 'image/bmp';
    case '.gif':
      return 'image/gif';
    case '.jpeg':
    case '.jpg':
      return 'image/jpeg';
    default:
      return DEFAULT_MIME;
  }
}

async function getClient() {
  if (shouldUseMock()) return null;
  if (client) return client;

  try {
    if (!googleModulePromise) {
      googleModulePromise = import('@google/generative-ai');
    }
    const module = await googleModulePromise;
    if (!module?.GoogleGenerativeAI) {
      console.warn('[geminiService] GoogleGenerativeAI export missing, falling back to mock');
      process.env.GEMINI_FORCE_MOCK = '1';
      return null;
    }
    client = new module.GoogleGenerativeAI(config.gemini.apiKey);
    return client;
  } catch (error) {
    console.error('[geminiService] failed to load Gemini SDK', error);
    process.env.GEMINI_FORCE_MOCK = '1';
    return null;
  }
}

function normalizeJsonResponse(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  try {
    // Try direct JSON parsing first
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return JSON.parse(trimmed);
    }
    // handle ```json ... ``` blocks
    const fenced = trimmed.replace(/```json|```/gi, '').trim();
    if (fenced.startsWith('{') || fenced.startsWith('[')) {
      return JSON.parse(fenced);
    }
  } catch (error) {
    console.error('[geminiService] failed to parse JSON response', error, raw);
  }
  return null;
}

async function generateJson({ contents, fallback }) {
  const generativeClient = await getClient();
  if (!generativeClient) return fallback();
  try {
    const model = generativeClient.getGenerativeModel({
      model: config.gemini.model,
      generationConfig: {
        temperature: 0.2,
        topP: 0.8
      }
    });
    const result = await model.generateContent({ contents });
    const text = result.response.text();
    console.debug?.('[geminiService] raw response', text);
    const parsed = normalizeJsonResponse(text);
    if (!parsed) {
      console.warn('[geminiService] unable to parse response as JSON', text);
    }
    if (parsed) return parsed;
  } catch (error) {
    console.error('[geminiService] generateContent failed', error);
  }
  return fallback();
}

export async function extractWordFromImage({ buffer, filename, mimetype } = {}) {
  ensureCacheDir();
  const key = cacheKey('ocr', buffer.toString('base64').slice(0, 128));
  const cached = readCache(key);
  if (cached) return cached;

  const fallback = () => MOCK_OCR_RESPONSE();
  if (shouldUseMock()) {
    const mockWords = fallback();
    writeCache(key, mockWords);
    return mockWords;
  }

  const mimeType = mimetype || getMimeFromFilename(filename);
  const contents = [
    {
      role: 'user',
      parts: [
        {
          text: [
            'You are an OCR assistant for English vocabulary flashcards.',
            'Extract ALL English words visible in the provided image.',
            'Respond with JSON array: [{"lemma": "<lowercase-word>", "confidence": <0-1 number>}, ...]',
            'Each word should be a separate object in the array.',
            'Only include actual English words, ignore numbers, symbols, or non-English text.',
            'If you cannot find any words, return an empty array [].'
          ].join(' ')
        },
        {
          inlineData: {
            mimeType,
            data: buffer.toString('base64')
          }
        }
      ]
    }
  ];

  const response = await generateJson({ contents, fallback });
  
  // Handle array response from Gemini
  let candidates = [];
  if (Array.isArray(response)) {
    // Direct array response
    candidates = response;
  } else if (Array.isArray(response?.words)) {
    // Nested array response
    candidates = response.words;
  } else if (response?.lemma) {
    // Single word response (backward compatibility)
    candidates = [response];
  } else {
    candidates = [];
  }

  const normalized = candidates
    .map((item) => ({
      lemma: item?.lemma?.toString().trim().toLowerCase() || '',
      confidence: (() => {
        const value = Number.parseFloat(item?.confidence);
        if (!Number.isFinite(value)) return 0;
        return Math.min(1, Math.max(0, value));
      })()
    }))
    .filter((item) => item.lemma);

  const result = normalized.length > 0 ? normalized : fallback();
  console.info('[geminiService] OCR result', result);
  writeCache(key, result);
  return result;
}

export async function getEnglishMetadata(word) {
  ensureCacheDir();
  const key = cacheKey('en-meta', word.toLowerCase());
  const cached = readCache(key);
  if (cached) return cached;

  const fallback = () => MOCK_EN_METADATA(word);
  if (shouldUseMock()) {
    const mock = fallback();
    writeCache(key, mock);
    return mock;
  }

  const contents = [
    {
      role: 'user',
      parts: [
        {
          text: [
            'You act as an English learner dictionary.',
            `Provide a concise definition and a short sentence for the word "${word}".`,
            'Respond with JSON: { "definition": "...", "example": "..." }.',
            'Definition should be within 25 words and example within 20 words.'
          ].join(' ')
        }
      ]
    }
  ];

  const response = await generateJson({ contents, fallback });
  const definition = response?.definition?.toString().trim();
  const example = response?.example?.toString().trim();
  const result = definition && example ? { definition, example } : fallback();
  writeCache(key, result);
  return result;
}

export async function getChineseSupplement(word, englishMeta) {
  ensureCacheDir();
  const payload = `${word}:${englishMeta.definition}:${englishMeta.example}`;
  const key = cacheKey('zh-meta', payload);
  const cached = readCache(key);
  if (cached) return cached;

  const fallback = () => MOCK_ZH_METADATA(word);
  if (shouldUseMock()) {
    const mock = fallback();
    writeCache(key, mock);
    return mock;
  }

  const contents = [
    {
      role: 'user',
      parts: [
        {
          text: [
            '你是一位面向中国学生的英语老师。',
            `英文单词: ${word}.`,
            `英文释义: ${englishMeta.definition}.`,
            `英文例句: ${englishMeta.example}.`,
            '请提供中文释义与不超过20字的中文例句。',
            '回答 JSON: { "definition": "...", "example": "..." }。'
          ].join(' ')
        }
      ]
    }
  ];

  const response = await generateJson({ contents, fallback });
  const definition = response?.definition?.toString().trim();
  const example = response?.example?.toString().trim();
  const result = definition && example ? { definition, example } : fallback();
  writeCache(key, result);
  return result;
}


