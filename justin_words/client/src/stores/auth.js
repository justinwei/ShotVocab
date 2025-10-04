import { defineStore } from 'pinia';
import axios from 'axios';
import router from '../router/index.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const TOKEN_KEY = 'justin_words_token';
let interceptorId = null;

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    token: null,
    loading: false,
    error: null,
    initialized: false
  }),
  getters: {
    isAuthenticated(state) {
      return !!state.user && !!state.token;
    }
  },
  actions: {
    setToken(token) {
      this.token = token;
      if (token) {
        window.localStorage.setItem(TOKEN_KEY, token);
        axios.defaults.headers.common.Authorization = `Bearer ${token}`;
      } else {
        window.localStorage.removeItem(TOKEN_KEY);
        delete axios.defaults.headers.common.Authorization;
      }
    },

    async initialize() {
      if (this.initialized) return;
      this.installInterceptor();
      const stored = window.localStorage.getItem(TOKEN_KEY);
      if (stored) {
        this.setToken(stored);
        try {
          await this.fetchProfile();
        } catch (error) {
          console.warn('[auth] failed to restore session', error);
          this.logout();
        }
      }
      this.initialized = true;
    },

    async register({ email, password }) {
      this.loading = true;
      this.error = null;
      try {
        const { data } = await axios.post(`${API_BASE}/api/auth/register`, { email, password });
        this.setToken(data.token);
        this.user = data.user;
        return data.user;
      } catch (error) {
        this.error = error.response?.data?.error || error.message;
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async login({ email, password }) {
      this.loading = true;
      this.error = null;
      try {
        const { data } = await axios.post(`${API_BASE}/api/auth/login`, { email, password });
        this.setToken(data.token);
        this.user = data.user;
        return data.user;
      } catch (error) {
        this.error = error.response?.data?.error || error.message;
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async fetchProfile() {
      if (!this.token) return null;
      try {
        const { data } = await axios.get(`${API_BASE}/api/auth/me`);
        this.user = data.user;
        return data.user;
      } catch (error) {
        this.error = error.response?.data?.error || error.message;
        throw error;
      }
    },

    logout() {
      this.user = null;
      this.error = null;
      this.setToken(null);
      if (router.currentRoute.value.meta?.requiresAuth !== false) {
        router.push({ path: '/login' });
      }
    },

    installInterceptor() {
      if (interceptorId !== null) return;
      interceptorId = axios.interceptors.response.use(
        (response) => response,
        (error) => {
          if (error.response?.status === 401) {
            this.logout();
          }
          return Promise.reject(error);
        }
      );
    }
  }
});
