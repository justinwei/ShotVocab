<template>
  <section class="library">
    <header class="library__header">
      <h2>词库</h2>
      <button class="ghost" type="button" @click="refresh" :disabled="words.loadingAll">
        {{ words.loadingAll ? '刷新中...' : '刷新' }}
      </button>
    </header>

    <p class="subtitle">浏览已导入的所有单词，点击查看中英文释义与例句</p>

    <form class="library__search" @submit.prevent="handleSearch">
      <input
        type="search"
        v-model="searchTerm"
        placeholder="输入单词查询"
        autocomplete="off"
        :disabled="words.loadingAll"
        aria-label="查询单词"
      />
      <button type="submit" :disabled="words.loadingAll">查询</button>
      <button
        v-if="words.searchQuery"
        type="button"
        class="ghost"
        @click="clearSearch"
        :disabled="words.loadingAll"
      >
        清除
      </button>
    </form>

    <div v-if="!words.loadingAll && totalWords" class="library__summary">
      共 {{ totalWords }} 个单词 · 每页 {{ pagination.pageSize }} 个 · 当前第 {{ pagination.page }} 页
    </div>

    <div v-if="words.error" class="state state--error">{{ words.error }}</div>
    <div v-else-if="words.loadingAll" class="state">正在加载...</div>
    <div v-else-if="!words.allWords.length && words.searchQuery" class="state">
      未找到匹配 “{{ words.searchQuery }}” 的单词。
    </div>
    <div v-else-if="!words.allWords.length" class="state">
      还没有单词，可在“录入”页上传图片或手动添加。
    </div>

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
          <div class="detail-actions">
            <button
              class="inline-action"
              type="button"
              @click.stop="() => regenerate(word)"
              :disabled="words.regeneratingIds.includes(word.id)"
            >
              {{ words.regeneratingIds.includes(word.id) ? '重新生成中...' : '重新生成释义' }}
            </button>
          </div>
        </details>
      </li>
    </ul>

    <div v-if="shouldShowPagination && words.allWords.length" class="library__pagination">
      <button type="button" @click="goToPrev" :disabled="!canGoPrev || words.loadingAll">上一页</button>
      <span class="library__pagination-info">
        第 {{ pagination.page }} / {{ totalPages || 1 }} 页
      </span>
      <button type="button" @click="goToNext" :disabled="!canGoNext || words.loadingAll">下一页</button>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref, computed, watch } from 'vue';
import axios from 'axios';
import { useWordsStore } from '../stores/words.js';

// 配置API基础URL
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const words = useWordsStore();
const audioCache = new Map();
const searchTerm = ref('');
const pagination = computed(() => words.allWordsPagination);
const totalPages = computed(() => {
  const declared = Number.isFinite(Number(pagination.value.totalPages))
    ? Number(pagination.value.totalPages)
    : null;
  if (declared !== null && declared >= 0) {
    return declared;
  }
  const total = pagination.value.total || 0;
  const size = pagination.value.pageSize || 1;
  return total > 0 ? Math.ceil(total / size) : 0;
});
const totalWords = computed(() => pagination.value.total || 0);
const canGoPrev = computed(() => (pagination.value.page || 1) > 1);
const canGoNext = computed(() => {
  if (pagination.value.hasMore) return true;
  const pages = totalPages.value;
  if (!pages) return false;
  return (pagination.value.page || 1) < pages;
});
const shouldShowPagination = computed(() => {
  return totalWords.value > (pagination.value.pageSize || 1) || canGoPrev.value || canGoNext.value;
});

watch(
  () => words.searchQuery,
  (value) => {
    searchTerm.value = value || '';
  },
  { immediate: true }
);

onMounted(() => {
  if (!words.allWords.length || !totalWords.value) {
    const initialPage = pagination.value.page || 1;
    words.fetchAllWords({ page: initialPage }).catch((error) => {
      console.error(error);
    });
  }
});

function handleSearch() {
  words
    .fetchAllWords({ query: searchTerm.value, page: 1 })
    .catch((error) => {
      console.error(error);
    });
}

function clearSearch() {
  if (!words.searchQuery && !searchTerm.value) return;
  searchTerm.value = '';
  words
    .fetchAllWords({ query: '', page: 1 })
    .catch((error) => {
      console.error(error);
    });
}

function goToPage(page) {
  const safePage = Math.max(1, page);
  const pageLimit = totalPages.value;
  if (pageLimit && safePage > pageLimit && !pagination.value.hasMore) {
    return;
  }
  words
    .fetchAllWords({ page: safePage })
    .catch((error) => {
      console.error(error);
    });
}

function goToPrev() {
  if (!canGoPrev.value || words.loadingAll) return;
  goToPage((pagination.value.page || 1) - 1);
}

function goToNext() {
  if (!canGoNext.value || words.loadingAll) return;
  goToPage((pagination.value.page || 1) + 1);
}

function refresh() {
  const targetPage = pagination.value.page || 1;
  words.fetchAllWords({ page: targetPage }).catch((error) => {
    console.error(error);
  });
}

function regenerate(word) {
  if (!word?.id) return;
  words
    .regenerateWord(word.id)
    .catch((error) => {
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

.library__search {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.library__search input {
  flex: 1;
  min-width: 220px;
  padding: 0.55rem 0.75rem;
  border: 1px solid #cbd5f5;
  border-radius: 8px;
  font-size: 0.95rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.library__search input:focus {
  border-color: #94a3b8;
  box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.2);
  outline: none;
}

.library__search input:disabled {
  background: #f8fafc;
  color: #94a3b8;
}

.library__search button[type='submit'] {
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 0.5rem 1.1rem;
  font-weight: 600;
  cursor: pointer;
}

.library__search button[type='submit']:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.library__summary {
  font-size: 0.9rem;
  color: #64748b;
  margin-top: -0.25rem;
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

.inline-action {
  background: #f1f5f9;
  border: 1px solid #cbd5f5;
  border-radius: 999px;
  padding: 0.25rem 0.9rem;
  font-size: 0.75rem;
  cursor: pointer;
}

.inline-action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.detail-actions {
  margin-top: 0.75rem;
  display: flex;
  justify-content: flex-end;
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

.library__pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
}

.library__pagination-info {
  font-size: 0.9rem;
  color: #475569;
}

.library__pagination button {
  background: #f1f5f9;
  border: 1px solid #cbd5f5;
  border-radius: 999px;
  padding: 0.45rem 1.2rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.library__pagination button:disabled {
  opacity: 0.6;
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
