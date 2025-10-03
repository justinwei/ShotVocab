import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const audioDir = path.join(config.uploadsDir, 'audio');

function ensureAudioDir() {
  if (!fs.existsSync(config.uploadsDir)) {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
  }
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
  }
}

function createSilentWav(durationMs = 800, sampleRate = 16000) {
  const samples = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  const bytesPerSample = 2; // 16-bit PCM
  const dataSize = samples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28); // Byte rate
  buffer.writeUInt16LE(bytesPerSample, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  // Data already zero-filled (silence)
  return buffer;
}

function shouldUseMock() {
  const hasMock = process.env.AZURE_SPEECH_FORCE_MOCK === '1';
  const hasApiKey = !!config.azure.speech.apiKey;
  const useMock = !hasApiKey || hasMock;
  console.log('[AzureS peech] Mock check:', { 
    hasApiKey, 
    hasMock, 
    useMock, 
    apiKey: config.azure.speech.apiKey ? '***' + config.azure.speech.apiKey.slice(-4) : 'none'
  });
  return useMock;
}

export async function synthesizeSpeech({ text, voice, cachePrefix = 'tts' }) {
  if (!text || !text.toString().trim()) {
    throw new Error('Text is required for speech synthesis');
  }
  
  ensureAudioDir();
  const trimmed = text.toString().trim();
  const voiceName = voice || config.azure.speech.voice;
  const hash = crypto.createHash('sha1').update(`${cachePrefix}:${voiceName}:${trimmed}`).digest('hex');
  const filename = `${cachePrefix}-${hash}.mp3`;
  const targetPath = path.join(audioDir, filename);
  
  if (fs.existsSync(targetPath)) {
    return targetPath;
  }

  const writeFallback = () => {
    const silent = createSilentWav();
    fs.writeFileSync(targetPath.replace('.mp3', '.wav'), silent);
    return targetPath.replace('.mp3', '.wav');
  };

  if (shouldUseMock()) {
    console.warn('[azureSpeechService] Azure Speech API key not configured, using fallback');
    return writeFallback();
  }

  try {
    // 临时方案：如果单词很简单，跳过TTS直接使用fallback
    if (trimmed.split(' ').length === 1 && trimmed.length < 15) {
      console.log(`[azureSpeechService] Skipping TTS for simple word: "${trimmed}", will use browser fallback`);
      // 返回一个很小的静默文件，让前端fallback到浏览器语音
      const tinyWav = createSilentWav(100); // 0.1秒静默
      fs.writeFileSync(targetPath, tinyWav);
      return targetPath;
    }

    // 继续使用Azure Speech for longer text
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="${voiceName}"><prosody rate="1.0" pitch="+0%" volume="medium">${trimmed}</prosody></voice></speak>`;

    const url = `https://${config.azure.speech.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': config.azure.speech.apiKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'justin-words-server'
      },
      body: ssml
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[azureSpeechService] API Error: ${response.status}`, errorText);
      throw new Error(`Azure Speech API error: ${response.status} - ${errorText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(audioBuffer);
    
    console.log(`[azureSpeechService] Received audio buffer: ${buffer.length} bytes`);
    console.log(`[azureSpeechService] First 50 bytes:`, buffer.slice(0, 50).toString('hex'));
    
    if (buffer.length > 0) {
      fs.writeFileSync(targetPath, buffer);
      console.log(`[azureSpeechService] Generated audio for: "${trimmed}" (${buffer.length} bytes)`);
      return targetPath;
    } else {
      console.warn('[azureSpeechService] Received empty audio buffer');
      return writeFallback();
    }

  } catch (error) {
    console.error('[azureSpeechService] Speech synthesis failed:', error);
    return writeFallback();
  }
}

export function getAvailableVoices() {
  // Common Azure Neural voices for English
  return [
    'en-US-AriaNeural',
    'en-US-JennyNeural', 
    'en-US-GuyNeural',
    'en-US-AnaNeural',
    'en-US-ChristopherNeural',
    'en-US-ElizabethNeural',
    'en-US-EricNeural',
    'en-US-MichelleNeural',
    'en-US-RogerNeural',
    'en-US-SteffanNeural'
  ];
}