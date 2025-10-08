import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0', // 允许外部访问
    port: 5173,
    allowedHosts: [
      'shotvocab.top',
      'www.shotvocab.top',
      'localhost',
      '.shotvocab.top' // 允许所有子域名
    ],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000', // 使用 127.0.0.1 而不是 localhost，强制 IPv4
        changeOrigin: true,
        ws: true // 启用 WebSocket 代理
      },
      '/uploads': {
        target: 'http://127.0.0.1:4000', // 使用 127.0.0.1 强制 IPv4
        changeOrigin: true
      }
    }
  }
});
