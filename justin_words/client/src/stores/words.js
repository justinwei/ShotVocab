import { defineStore } from 'pinia';
import axios from 'axios';

// 配置API基础URL
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export const useWordsStore = defineStore('words', {
  state: () => ({
    lastCreated: [],
    uploading: false,
    error: null,
    allWords: [],
    loadingAll: false
  }),
  actions: {
    async uploadImageFile(file) {
      if (!file) throw new Error('请选择图片');
      this.uploading = true;
      this.error = null;
      try {
        const form = new FormData();
        form.append('image', file);
        const { data } = await axios.post(`${API_BASE}/api/words/image`, form);
        this.lastCreated = Array.isArray(data.words) ? data.words : [];
        this.upsertAllWords(this.lastCreated);
        return data;
      } catch (error) {
        this.error = error.response?.data?.error || error.message;
        throw error;
      } finally {
        this.uploading = false;
      }
    },

    async createWord(lemma) {
      if (!lemma?.trim()) throw new Error('请输入单词');
      this.uploading = true;
      this.error = null;
      try {
        const { data } = await axios.post(`${API_BASE}/api/words`, { word: lemma.trim() });
        this.lastCreated = [data];
        this.upsertAllWords(this.lastCreated);
        return data;
      } catch (error) {
        this.error = error.response?.data?.error || error.message;
        throw error;
      } finally {
        this.uploading = false;
      }
    },

    async fetchAllWords(limit = 500) {
      this.loadingAll = true;
      this.error = null;
      try {
        const { data } = await axios.get(`${API_BASE}/api/words`, { params: { limit } });
        this.allWords = Array.isArray(data.words) ? data.words : [];
        return this.allWords;
      } catch (error) {
        this.error = error.response?.data?.error || error.message;
        throw error;
      } finally {
        this.loadingAll = false;
      }
    },

    upsertAllWords(words) {
      if (!Array.isArray(words) || !words.length) return;
      const merged = [...this.allWords];
      for (const entry of words) {
        if (!entry) continue;
        const key = entry.id ?? entry.lemma;
        const index = merged.findIndex((item) => (key && item.id === entry.id) || (!entry.id && item.lemma === entry.lemma));
        if (index >= 0) {
          merged[index] = { ...merged[index], ...entry };
        } else {
          merged.unshift(entry);
        }
      }
      this.allWords = merged;
    },

    resetLastCreated() {
      this.lastCreated = [];
    }
  }
});
