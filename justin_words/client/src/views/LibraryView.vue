<template>
  <section class="library">
    <header class="library__header">
      <h2>词库</h2>
      <button class="ghost" type="button" @click="refresh" :disabled="words.loadingAll">
        {{ words.loadingAll ? '刷新中...' : '刷新' }}
      </button>
    </header>

    <p class="subtitle">浏览已导入的所有单词，点击查看中英文释义与例句</p>

    <div v-if="words.error" class="state state--error">{{ words.error }}</div>
    <div v-else-if="words.loadingAll" class="state">正在加载...</div>
    <div v-else-if="!words.allWords.length" class="state">还没有单词，可在“录入”页上传图片或手动添加。</div>

    <ul v-else class="word-list">
      <li v-for="word in words.allWords" :key="word.id || word.lemma">
        <details>
          <summary>
            <span class="lemma">{{ word.lemma }}</span>
            <div class="summary-tools">
              <button
                class="inline-audio"
                type="button"
                @click.stop="() => playAudio(word, 'word')"
                aria-label="播放单词发音"
              >
                🔊
              </button>
              <span class="created-at" v-if="word.createdAt">{{ formatDate(word.createdAt) }}</span>
            </div>
          </summary>
          <div class="definition">
            <div class="heading-with-audio">
              <h4>英文释义</h4>
              <button
                class="inline-audio"
                type="button"
                @click.stop="() => playAudio(word, 'enDefinition')"
                :disabled="!word.enDefinition"
                aria-label="播放英文释义"
              >
                🔊
              </button>
            </div>
            <p>{{ word.enDefinition || '暂无英文释义' }}</p>
            <div class="heading-with-audio">
              <h5>英文例句</h5>
              <button
                class="inline-audio"
                type="button"
                @click.stop="() => playAudio(word, 'enExample')"
                :disabled="!word.enExample"
                aria-label="播放英文例句"
              >
                🔊
              </button>
            </div>
            <p>{{ word.enExample || '暂无英文例句' }}</p>
          </div>
          <div class="definition">
            <h4>中文释义</h4>
            <p>{{ word.zhDefinition || '暂无中文释义' }}</p>
            <h5>中文例句</h5>
            <p>{{ word.zhExample || '暂无中文例句' }}</p>
          </div>
        </details>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { onMounted } from 'vue';
import axios from 'axios';
import { useWordsStore } from '../stores/words.js';

// 配置API基础URL
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const words = useWordsStore();
const audioCache = new Map();

onMounted(() => {
  if (!words.allWords.length) {
    words.fetchAllWords().catch((error) => {
      console.error(error);
    });
  }
});

function refresh() {
  words.fetchAllWords().catch((error) => {
    console.error(error);
  });
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(value));
  } catch (error) {
    console.error(error);
    return value;
  }
}

async function playAudio(word, target = 'word') {
  if (!word) return;
  let text = word.lemma;
  if (target === 'enDefinition') {
    text = word.enDefinition;
  } else if (target === 'enExample') {
    text = word.enExample;
  }
  if (!text || !word.id) {
    return;
  }

  const key = `${word.id || word.lemma}:${target}`;
  let url;
  
  // 优先使用预生成的音频URLs
  if (target === 'word') {
    url = word.audioUrl;
  } else if (target === 'enDefinition') {
    url = word.enDefinitionAudioUrl || audioCache.get(key);
  } else if (target === 'enExample') {
    url = word.enExampleAudioUrl || audioCache.get(key);
  } else {
    url = audioCache.get(key);
  }

  if (!url) {
    try {
      const { data } = await axios.get(`${API_BASE}/api/words/${word.id}/audio`, { params: { target } });
      url = data.url;
      if (target === 'word') {
        word.audioUrl = url;
      } else if (target === 'enDefinition') {
        word.enDefinitionAudioUrl = url;
        audioCache.set(key, url);
      } else if (target === 'enExample') {
        word.enExampleAudioUrl = url;
        audioCache.set(key, url);
      } else if (url) {
        audioCache.set(key, url);
      }
    } catch (error) {
      console.error(error);
    }
  }

  if (url) {
    // 确保使用完整的后端服务器URL
    const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
    const audio = new Audio(fullUrl);
    audio.play().catch(() => fallbackSpeech(text));
  } else {
    fallbackSpeech(text);
  }
}

function fallbackSpeech(text) {
  if (!text || !('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const enVoice = voices.find((voice) => voice.lang === 'en-US' || voice.lang === 'en_US');
  if (enVoice) utterance.voice = enVoice;
  utterance.rate = 0.95;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
</script>

<style scoped>
.library {
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.library__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.subtitle {
  margin: 0;
  color: #64748b;
}

.state {
  background: #f1f5f9;
  padding: 1rem 1.25rem;
  border-radius: 10px;
  color: #475569;
}

.state--error {
  background: #fee2e2;
  color: #b91c1c;
}

.word-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.word-list details {
  background: #fff;
  border-radius: 12px;
  padding: 1rem 1.25rem;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
}

.word-list summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  font-weight: 600;
  color: #0f172a;
}

.word-list summary::-webkit-details-marker {
  display: none;
}

.lemma {
  font-size: 1.1rem;
}

.summary-tools {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.created-at {
  font-size: 0.85rem;
  color: #94a3b8;
}

.definition {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.definition h4,
.definition h5 {
  margin: 0;
  color: #1f2937;
}

.definition p {
  margin: 0;
  color: #475569;
}

.heading-with-audio {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.heading-with-audio h4,
.heading-with-audio h5 {
  margin: 0;
}

.inline-audio {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.1rem;
}

.inline-audio:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

button.ghost {
  background: transparent;
  border: 1px solid #cbd5f5;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  color: #1f2937;
}

button.ghost:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
