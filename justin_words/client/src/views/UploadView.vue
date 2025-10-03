<template>
  <section class="upload">
    <h2>录入新单词</h2>
    <p class="subtitle">通过拍照识别或手动输入添加新词</p>

    <div class="card">
      <h3>拍照 / 选择图片</h3>
      <form @submit.prevent="submitImage" class="form">
        <label class="file-input">
          <span>选择或拍摄一张包含单词的图片</span>
          <input type="file" accept="image/*" capture="environment" @change="handleFile" />
        </label>
        <div v-if="preview" class="preview">
          <img :src="preview" alt="预览" />
        </div>
        <button class="primary" type="submit" :disabled="!selectedFile || words.uploading">
          {{ words.uploading ? '识别中...' : '开始识别' }}
        </button>
      </form>
    </div>

    <div class="card">
      <h3>手动输入</h3>
      <form @submit.prevent="submitManual" class="form">
        <input
          v-model="manualWord"
          type="text"
          placeholder="输入单词，例如 vocabulary"
          autocomplete="off"
        />
        <button class="secondary" type="submit" :disabled="!manualWord || words.uploading">
          {{ words.uploading ? '提交中...' : '添加单词' }}
        </button>
      </form>
    </div>

    <div v-if="words.error" class="alert">{{ words.error }}</div>

    <div v-if="words.lastCreated.length" class="result">
      <h3>已添加</h3>
      <ul>
        <li v-for="word in words.lastCreated" :key="word.id || word.lemma">
          <div class="result-header">
            <strong>{{ word.lemma || word.word }}</strong>
            <span v-if="word.confidence !== undefined">置信度 {{ formatConfidence(word.confidence) }}</span>
          </div>
          <p v-if="word.enDefinition" class="result-meta">英文释义：{{ word.enDefinition }}</p>
          <p v-if="word.enExample" class="result-meta">英文例句：{{ word.enExample }}</p>
          <p v-if="word.zhDefinition" class="result-meta">中文释义：{{ word.zhDefinition }}</p>
          <p v-if="word.zhExample" class="result-meta">中文例句：{{ word.zhExample }}</p>
        </li>
      </ul>
      <button class="ghost" @click="words.resetLastCreated">继续添加</button>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue';
import { useWordsStore } from '../stores/words.js';

const words = useWordsStore();
const selectedFile = ref(null);
const preview = ref('');
const manualWord = ref('');

function handleFile(event) {
  const [file] = event.target.files || [];
  if (!file) {
    selectedFile.value = null;
    preview.value = '';
    return;
  }
  selectedFile.value = file;
  preview.value = URL.createObjectURL(file);
  words.resetLastCreated();
}

async function submitImage() {
  if (!selectedFile.value) return;
  try {
    const response = await words.uploadImageFile(selectedFile.value);
    manualWord.value = response.words?.[0]?.lemma || '';
  } catch (error) {
    console.error(error);
  }
}

async function submitManual() {
  if (!manualWord.value) return;
  try {
    await words.createWord(manualWord.value);
    manualWord.value = '';
  } catch (error) {
    console.error(error);
  }
}

function formatConfidence(value) {
  if (typeof value !== 'number') return '';
  return `${Math.round(value * 100)}%`;
}
</script>

<style scoped>
.upload {
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.subtitle {
  margin: 0;
  color: #64748b;
}

.card {
  background: #fff;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.file-input {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px dashed #94a3b8;
  border-radius: 10px;
  color: #475569;
  cursor: pointer;
}

.file-input input {
  display: none;
}

.preview {
  width: 100%;
  border-radius: 10px;
  overflow: hidden;
}

.preview img {
  width: 100%;
  display: block;
  object-fit: cover;
}

input[type='text'] {
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border: 1px solid #cbd5f5;
  font-size: 1rem;
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
  color: #1f2937;
}

.ghost {
  background: transparent;
  color: #1f2937;
  border: 1px solid #cbd5f5;
}

.alert {
  background: #fee2e2;
  color: #991b1b;
  padding: 0.75rem 1rem;
  border-radius: 8px;
}

.result {
  background: #f1f5f9;
  border-radius: 12px;
  padding: 1.5rem;
  text-align: left;
}

.result ul {
  margin: 0 0 1rem;
  padding-left: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
}

.result-meta {
  margin: 0.1rem 0 0;
  color: #475569;
  font-size: 0.95rem;
}
</style>
