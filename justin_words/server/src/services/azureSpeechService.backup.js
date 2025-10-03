// 临时测试：使用ResponsiveVoice在线TTS服务
export async function synthesizeSpeech({ text, voice, cachePrefix = 'tts' }) {
  if (!text || !text.toString().trim()) {
    throw new Error('Text is required for speech synthesis');
  }
  
  ensureAudioDir();
  const trimmed = text.toString().trim();
  const hash = crypto.createHash('sha1').update(`${cachePrefix}:responsivevoice:${trimmed}`).digest('hex');
  const filename = `${cachePrefix}-${hash}.wav`;
  const targetPath = path.join(audioDir, filename);
  
  if (fs.existsSync(targetPath)) {
    return targetPath;
  }

  console.log(`[azureSpeechService] Generating test audio for: "${trimmed}"`);
  
  // 创建一个简单的提示文件而不是实际音频
  const testContent = `Test audio placeholder for: ${trimmed}`;
  fs.writeFileSync(targetPath.replace('.wav', '.txt'), testContent);
  
  // 创建一个静默音频文件作为占位符
  const silentWav = createSilentWav(800); // 0.8秒静默
  fs.writeFileSync(targetPath, silentWav);
  
  console.log(`[azureSpeechService] Created placeholder audio for: "${trimmed}"`);
  return targetPath;
}