import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0', // 允许外部访问
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://192.168.3.47:4000', // 使用实际IP地址
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://192.168.3.47:4000', // 使用实际IP地址
        changeOrigin: true
      }
    }
  }
});
