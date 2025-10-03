import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: process.env.DOTENV_PATH || undefined });

const rootDir = path.resolve(__dirname, '../../');

export const config = {
  port: Number(process.env.PORT || 4000),
  uploadsDir: process.env.UPLOADS_DIR || path.join(rootDir, 'uploads'),
  databaseFile: process.env.SQLITE_PATH || path.join(rootDir, 'data', 'justin_words.db'),
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
