<template>
  <section class="study">
    <header class="study__toolbar">
      <button @click="refresh" :disabled="reviews.loading">刷新列表</button>
      <span v-if="reviews.loading" class="status">加载中...</span>
      <span v-else-if="reviews.error" class="status error">{{ reviews.error }}</span>
    </header>

    <div v-if="reviews.isEmpty && !reviews.loading" class="empty">
      <p>今天的复习任务完成啦！</p>
      <p class="hint">可以去录入新单词或稍后再来刷新。</p>
    </div>

    <div v-else-if="current" class="card">
      <div class="word-head">
        <h2>{{ current.lemma }}</h2>
        <button class="audio" type="button" @click="() => playAudio('word')" aria-label="播放美式发音">🔊</button>
      </div>

      <div v-if="reviews.detailsVisible" class="details">
        <div class="heading-with-audio">
          <h3>英文释义</h3>
          <button
            class="inline-audio"
            type="button"
            @click="() => playAudio('enDefinition')"
            :disabled="!current.enDefinition"
            aria-label="播放英文释义"
          >
            🔊
          </button>
        </div>
        <p>{{ current.enDefinition || '暂无释义' }}</p>
        <div class="heading-with-audio">
          <h3>英文例句</h3>
          <button
            class="inline-audio"
            type="button"
            @click="() => playAudio('enExample')"
            :disabled="!current.enExample"
            aria-label="播放英文例句"
          >
            🔊
          </button>
        </div>
        <p>{{ current.enExample || '暂无例句' }}</p>

        <div class="zh-section" v-if="reviews.chineseVisible">
          <h3>中文释义</h3>
          <p>{{ chineseDefinition }}</p>
          <h3>中文例句</h3>
          <p>{{ chineseExample }}</p>
        </div>
        <button v-else class="primary" type="button" @click="showChinese" :disabled="!reviews.zhSupplement">
          中文
        </button>
        <button class="ghost" type="button" @click="nextCard">下一词</button>
      </div>

      <div v-else class="actions">
        <button class="secondary" type="button" @click="rate('熟悉')" :disabled="reviews.loading">熟悉</button>
        <button class="secondary" type="button" @click="rate('简单')" :disabled="reviews.loading">简单</button>
        <button class="primary" type="button" @click="rate('生词')" :disabled="reviews.loading">生词</button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue';
import axios from 'axios';
import { useReviewsStore } from '../stores/reviews.js';

// 配置API基础URL
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const reviews = useReviewsStore();

const current = computed(() => reviews.currentReview);
const chineseDefinition = computed(() => reviews.zhSupplement?.definition || '等待生成...');
const chineseExample = computed(() => reviews.zhSupplement?.example || '等待生成...');
const audioCache = new Map();

onMounted(() => {
  if (!reviews.queue.length) {
    reviews.fetchReviews();
  }
});

watch(current, (value) => {
  if (value) {
    reviews.resetDetails();
    // 不再自动播放音频，让用户手动点击播放
    console.log('[StudyView] Current word changed to:', value.lemma);
  }
});

function refresh() {
  reviews.fetchReviews();
}

async function rate(label) {
  await reviews.submitRating(label);
  if (label !== '生词' && reviews.isEmpty) {
    reviews.fetchReviews();
  }
}

function nextCard() {
  reviews.advanceQueue();
  if (reviews.isEmpty) {
    reviews.fetchReviews();
  }
}

function showChinese() {
  reviews.revealChinese();
}

async function playAudio(target = 'word') {
  const card = current.value;
  console.log('[StudyView] playAudio called', { target, card });
  if (!card || !card.wordId) {
    console.log('[StudyView] No card or wordId', { card });
    return;
  }
  let textForFallback = card.lemma;
  if (target === 'enDefinition') {
    textForFallback = card.enDefinition;
  } else if (target === 'enExample') {
    textForFallback = card.enExample;
  }
  if (!textForFallback) return;

  // 对于单词发音，使用优化的浏览器语音合成
  if (target === 'word') {
    console.log('[StudyView] Using optimized browser speech for word pronunciation');
    fallbackSpeech(textForFallback);
    return;
  }

  const cacheKey = `${card.wordId}:${target}`;
  let url = audioCache.get(cacheKey);
  console.log('[StudyView] Initial URL check for definitions/examples', { target, url });

  if (!url) {
    console.log('[StudyView] No cached URL, fetching from API');
    try {
      const { data } = await axios.get(`${API_BASE}/api/words/${card.wordId}/audio`, {
        params: { target }
      });
      url = data.url;
      console.log('[StudyView] Got URL from API', { url });
      if (url) {
        audioCache.set(cacheKey, url);
      }
    } catch (error) {
      console.error('[StudyView] Failed to fetch audio URL', error);
    }
  }

  if (url) {
    // 确保使用完整的后端服务器URL
    const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
    console.log('[StudyView] Attempting to play audio', { url, fullUrl });
    
    const audio = new Audio(fullUrl);
    
    // 添加音频事件监听器来调试
    audio.addEventListener('loadstart', () => console.log('[StudyView] Audio load started'));
    audio.addEventListener('canplay', () => {
      console.log('[StudyView] Audio can play');
      // 检查音频长度，如果很短可能是占位符
      if (audio.duration && audio.duration < 0.5) {
        console.log('[StudyView] Audio too short, using fallback speech');
        fallbackSpeech(textForFallback);
        return;
      }
    });
    audio.addEventListener('error', (e) => console.error('[StudyView] Audio error', e));
    
    audio.play().then(() => {
      console.log('[StudyView] Audio played successfully');
    }).catch((error) => {
      console.error('[StudyView] Audio play failed, using fallback', error);
      fallbackSpeech(textForFallback);
    });
    return;
  }
  console.log('[StudyView] No URL available, using fallback');
  fallbackSpeech(textForFallback);
}

function fallbackSpeech(text) {
  if (!('speechSynthesis' in window)) return;
  
  // 确保voices已加载
  const speakText = () => {
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    
    // 寻找更好的英语语音（优先选择Neural或高质量语音）
    const preferredVoices = [
      'Microsoft Aria Online (Natural) - English (United States)',
      'Microsoft Zira - English (United States)', 
      'Google US English',
      'Alex',
      'Samantha'
    ];
    
    let selectedVoice = null;
    for (const preferredName of preferredVoices) {
      selectedVoice = voices.find(voice => voice.name.includes(preferredName) || voice.name === preferredName);
      if (selectedVoice) break;
    }
    
    // 如果没找到首选语音，寻找任何美式英语语音
    if (!selectedVoice) {
      selectedVoice = voices.find(voice => 
        (voice.lang === 'en-US' || voice.lang === 'en_US') && 
        (voice.name.toLowerCase().includes('neural') || voice.name.toLowerCase().includes('natural'))
      );
    }
    
    // 最后备选任何英语语音
    if (!selectedVoice) {
      selectedVoice = voices.find(voice => voice.lang.startsWith('en'));
    }
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      console.log('[StudyView] Using voice:', selectedVoice.name);
    }
    
    // 优化语音参数
    utterance.rate = 0.85;      // 稍慢一点
    utterance.pitch = 1.0;      // 正常音调
    utterance.volume = 0.9;     // 稍微降低音量
    
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };
  
  // 如果语音还未加载，等待加载完成
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.addEventListener('voiceschanged', speakText, { once: true });
  } else {
    speakText();
  }
}
</script>

<style scoped>
.study {
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.study__toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status {
  font-size: 0.85rem;
  color: #475569;
}

.status.error {
  color: #ef4444;
}

.empty {
  background: #fff;
  border-radius: 12px;
  padding: 2rem;
  text-align: center;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
}

.empty .hint {
  margin-top: 0.5rem;
  color: #64748b;
}

.card {
  background: #fff;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.word-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.word-head h2 {
  margin: 0;
  font-size: 2rem;
  text-transform: capitalize;
}

.audio {
  font-size: 1.5rem;
  background: none;
  border: none;
  cursor: pointer;
}

.heading-with-audio {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.heading-with-audio h3 {
  margin: 0;
}

.inline-audio {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.1rem;
}

.inline-audio:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.actions {
  display: grid;
  gap: 0.75rem;
}

button {
  border-radius: 8px;
  border: none;
  padding: 0.75rem 1rem;
  cursor: pointer;
  font-weight: 600;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.primary {
  background: linear-gradient(135deg, #38bdf8, #0ea5e9);
  color: #fff;
}

.secondary {
  background: #e2e8f0;
  color: #1e293b;
}

.ghost {
  background: transparent;
  color: #1e293b;
  border: 1px solid #cbd5f5;
}

.details h3 {
  margin: 0.75rem 0 0.25rem;
  font-size: 1rem;
}

.details p {
  margin: 0;
  line-height: 1.5;
}

.zh-section {
  background: #f1f5f9;
  padding: 0.75rem;
  border-radius: 8px;
  margin-top: 1rem;
}
</style>
