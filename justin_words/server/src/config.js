import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local (if exists) or .env
const rootDir = path.resolve(__dirname, '../../');
const envLocalPath = path.join(rootDir, '.env.local');
const envPath = path.join(rootDir, '.env');

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
  console.log('[config] Loaded environment from .env.local');
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('[config] Loaded environment from .env');
} else {
  dotenv.config(); // fallback to default behavior
}

export const config = {
  port: Number(process.env.PORT || 4000),
  uploadsDir: process.env.UPLOADS_DIR || path.join(rootDir, 'uploads'),
  databaseFile: process.env.SQLITE_PATH || path.join(rootDir, 'data', 'justin_words.db'),
  auth: {
    jwtSecret: process.env.JWT_SECRET || process.env.AUTH_SECRET || 'insecure-development-secret',
    tokenTtl: process.env.JWT_TTL || '7d'
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  },
  azure: {
    speech: {
      apiKey: process.env.AZURE_SPEECH_API_KEY || '',
      region: process.env.AZURE_SPEECH_REGION || 'eastus',
      voice: process.env.AZURE_SPEECH_VOICE || 'en-US-AriaNeural'
    }
  }
};

export const paths = {
  rootDir,
  dataDir: path.dirname(config.databaseFile)
};
