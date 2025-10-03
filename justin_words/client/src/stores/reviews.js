import { defineStore } from 'pinia';
import axios from 'axios';

// 配置API基础URL
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export const useReviewsStore = defineStore('reviews', {
  state: () => ({
    queue: [],
    loading: false,
    error: null,
    activeIndex: 0,
    detailsVisible: false,
    chineseVisible: false,
    lastScheduling: null,
    zhSupplement: null
  }),

  getters: {
    currentReview(state) {
      return state.queue[state.activeIndex] || null;
    },
    isEmpty(state) {
      return state.queue.length === 0;
    }
  },

  actions: {
    async fetchReviews(limit = 20) {
      this.loading = true;
      this.error = null;
      try {
        const { data } = await axios.get(`${API_BASE}/api/reviews/today`, {
          params: { limit }
        });
        this.queue = data.reviews || [];
        this.activeIndex = 0;
        this.detailsVisible = false;
        this.chineseVisible = false;
        this.lastScheduling = null;
        this.zhSupplement = null;
      } catch (error) {
        this.error = error.response?.data?.error || error.message;
      } finally {
        this.loading = false;
      }
    },

    resetDetails() {
      this.detailsVisible = false;
      this.chineseVisible = false;
      this.lastScheduling = null;
      this.zhSupplement = null;
    },

    revealDetails() {
      this.detailsVisible = true;
    },

    revealChinese() {
      this.chineseVisible = true;
    },

    advanceQueue() {
      if (!this.queue.length) return;
      this.queue.splice(this.activeIndex, 1);
      if (this.queue.length === 0) {
        this.activeIndex = 0;
      } else if (this.activeIndex >= this.queue.length) {
        this.activeIndex = this.queue.length - 1;
      }
      this.resetDetails();
    },

    async submitRating(rating) {
      const current = this.currentReview;
      if (!current) return;
      this.loading = true;
      this.error = null;
      try {
        const { data } = await axios.post(`${API_BASE}/api/reviews/${current.reviewId}/response`, {
          rating
        });
        this.lastScheduling = data.scheduling;
        this.zhSupplement = data.zhSupplement;

        if (rating === '生词') {
          this.revealDetails();
        } else {
          this.advanceQueue();
        }
      } catch (error) {
        this.error = error.response?.data?.error || error.message;
      } finally {
        this.loading = false;
      }
    }
  }
});
