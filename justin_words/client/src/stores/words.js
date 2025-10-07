import { defineStore } from 'pinia';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function normalizeLemma(value) {
  return value?.trim().toLowerCase();
}

function buildProgressItems(lemmas, status = 'pending') {
  return lemmas.map((lemma) => ({
    lemma,
    status
  }));
}

function normalizeProgressStatus(status) {
  if (status === 'completed') return 'done';
  return status;
}

export const useWordsStore = defineStore('words', {
  state: () => ({
    lastCreated: [],
    uploading: false,
    error: null,
    allWords: [],
    loadingAll: false,
    uploadProgress: {
      items: [],
      currentLemma: null
    },
    regeneratingIds: [],
    imagePreview: {
      uploadId: null,
      items: []
    }
  }),
  actions: {
    resetProgress() {
      this.uploadProgress = {
        items: [],
        currentLemma: null
      };
    },

    resetImagePreview() {
      this.imagePreview = {
        uploadId: null,
        items: []
      };
    },

    setProgressStatus(status) {
      const normalizedStatus = normalizeProgressStatus(status);
      this.uploadProgress = {
        items: this.uploadProgress.items.map((item) => ({ ...item, status: normalizedStatus })),
        currentLemma: normalizedStatus === 'processing'
          ? this.uploadProgress.items.find((item) => item.status === 'processing')?.lemma || null
          : null
      };
    },

    markProgressLemma(lemma, status) {
      const normalizedLemma = normalizeLemma(lemma);
      if (!normalizedLemma) return;
      const normalizedStatus = normalizeProgressStatus(status);
      const updatedItems = this.uploadProgress.items.map((item) =>
        item.lemma === normalizedLemma ? { ...item, status: normalizedStatus } : item
      );
      const currentLemma =
        normalizedStatus === 'processing'
          ? normalizedLemma
          : this.uploadProgress.currentLemma === normalizedLemma
            ? null
            : this.uploadProgress.currentLemma;
      this.uploadProgress = {
        items: updatedItems,
        currentLemma
      };
    },

    updateProgressStatusesByLemma(lemmas, status) {
      if (!Array.isArray(lemmas) || !lemmas.length) return;
      const normalizedStatus = normalizeProgressStatus(status);
      const lookup = new Set(
        lemmas
          .map((lemma) => normalizeLemma(typeof lemma === 'string' ? lemma : lemma?.lemma || lemma?.word))
          .filter(Boolean)
      );
      if (!lookup.size) return;

      const updatedItems = this.uploadProgress.items.map((item) =>
        lookup.has(item.lemma) ? { ...item, status: normalizedStatus } : item
      );
      const currentLemma = updatedItems.find((item) => item.status === 'processing')?.lemma || null;
      this.uploadProgress = {
        items: updatedItems,
        currentLemma
      };
    },

    async uploadImageFile(file) {
      if (!file) throw new Error('请选择图片');
      if (this.imagePreview.uploadId) {
        await this.cancelImagePreview();
      }
      this.uploading = true;
      this.error = null;
      this.lastCreated = [];
      this.resetProgress();
      try {
        const form = new FormData();
        form.append('image', file);
        const { data } = await axios.post(`${API_BASE}/api/words/image/preview`, form);
        const items = Array.isArray(data.words)
          ? data.words.map((entry) => ({
              lemma: normalizeLemma(entry.lemma),
              confidence: entry.confidence ?? null,
              selected: true,
              status: 'pending'
            }))
          : [];
        this.imagePreview = {
          uploadId: data.uploadId,
          items
        };
        return this.imagePreview;
      } catch (error) {
        this.error = error.response?.data?.error || error.message;
        throw error;
      } finally {
        this.uploading = false;
      }
    },

    togglePreviewSelection(lemma) {
      if (!this.imagePreview.items.length) return;
      const updated = this.imagePreview.items.map((item) =>
        item.lemma === lemma ? { ...item, selected: !item.selected } : item
      );
      this.imagePreview = {
        ...this.imagePreview,
        items: updated
      };
    },

    async confirmImageImport() {
      if (!this.imagePreview.uploadId) throw new Error('没有可导入的图片');
      const selectedItems = this.imagePreview.items.filter((item) => item.selected);
      const selected = selectedItems.map((item) => item.lemma);
      if (!selected.length) throw new Error('至少选择一个单词');
      this.uploading = true;
      this.error = null;
      this.lastCreated = [];
      this.uploadProgress = {
        items: selectedItems.map((item, index) => ({
          lemma: item.lemma,
          confidence: item.confidence ?? undefined,
          status: index === 0 ? 'processing' : 'pending'
        })),
        currentLemma: selected[0] || null
      };
      try {
        const allCreated = [];
        for (let index = 0; index < selectedItems.length; index += 1) {
          const current = selectedItems[index];
          const isLast = index === selectedItems.length - 1;
          const { data } = await axios.post(`${API_BASE}/api/words/image/confirm`, {
            uploadId: this.imagePreview.uploadId,
            words: [current.lemma],
            finalize: isLast
          });
          const createdBatch = Array.isArray(data.words) ? data.words : [];
          if (createdBatch.length) {
            allCreated.push(...createdBatch);
            this.lastCreated = [...this.lastCreated, ...createdBatch];
            this.upsertAllWords(createdBatch);
            this.updateProgressStatusesByLemma(createdBatch, 'done');
          } else {
            this.markProgressLemma(current.lemma, 'error');
            throw new Error('未能导入单词');
          }

          if (!isLast) {
            const nextLemma = selectedItems[index + 1]?.lemma;
            if (nextLemma) {
              this.markProgressLemma(nextLemma, 'processing');
            }
          }
        }

        this.setProgressStatus('done');
        this.resetImagePreview();
        return allCreated;
      } catch (error) {
        this.error = error.response?.data?.error || error.message;
        if (this.uploadProgress.currentLemma) {
          this.markProgressLemma(this.uploadProgress.currentLemma, 'error');
        }
        throw error;
      } finally {
        this.uploading = false;
      }
    },

    async cancelImagePreview() {
      if (!this.imagePreview.uploadId) {
        this.resetImagePreview();
        return;
      }
      try {
        await axios.post(`${API_BASE}/api/words/image/cancel`, {
          uploadId: this.imagePreview.uploadId
        });
      } catch (error) {
        console.error('Failed to cancel preview', error);
      } finally {
        this.resetImagePreview();
      }
    },

    async createWord(input) {
      if (!input?.trim()) throw new Error('请输入单词');
      const tokens = input
        .split(/[\s,，]+/g)
        .map((item) => normalizeLemma(item))
        .filter(Boolean);
      if (!tokens.length) throw new Error('请输入单词');

      this.uploading = true;
      this.error = null;
      this.uploadProgress = {
        items: buildProgressItems(tokens, 'processing'),
        currentLemma: tokens[0]
      };
      try {
        const { data } = await axios.post(`${API_BASE}/api/words`, {
          word: input.trim(),
          words: tokens
        });
        const created = Array.isArray(data.words) ? data.words : [];
        this.lastCreated = created;
        this.upsertAllWords(created);
        this.updateProgressStatusesByLemma(created, 'done');
        this.setProgressStatus('done');
        return created;
      } catch (error) {
        this.error = error.response?.data?.error || error.message;
        this.setProgressStatus('error');
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
      this.resetProgress();
      this.resetImagePreview();
    },

    async regenerateWord(wordId) {
      if (!wordId) return null;
      if (!this.regeneratingIds.includes(wordId)) {
        this.regeneratingIds = [...this.regeneratingIds, wordId];
      }
      this.error = null;
      try {
        const { data } = await axios.post(`${API_BASE}/api/words/${wordId}/regenerate`);
        if (data?.word) {
          this.upsertAllWords([data.word]);
        }
        return data?.word || null;
      } catch (error) {
        this.error = error.response?.data?.error || error.message;
        throw error;
      } finally {
        this.regeneratingIds = this.regeneratingIds.filter((id) => id !== wordId);
      }
    }
  }
});
