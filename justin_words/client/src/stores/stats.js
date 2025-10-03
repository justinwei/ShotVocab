import { defineStore } from 'pinia';
import axios from 'axios';

// 配置API基础URL
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export const useStatsStore = defineStore('stats', {
  state: () => ({
    loading: false,
    error: null,
    items: []
  }),
  actions: {
    async fetchRange({ start, end } = {}) {
      this.loading = true;
      this.error = null;
      try {
        const { data } = await axios.get(`${API_BASE}/api/stats/daily`, {
          params: { start, end }
        });
        this.items = data.stats || [];
      } catch (error) {
        this.error = error.response?.data?.error || error.message;
      } finally {
        this.loading = false;
      }
    }
  }
});
