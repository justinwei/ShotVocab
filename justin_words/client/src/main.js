import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router/index.js';
import './assets/main.css';
import { useAuthStore } from './stores/auth.js';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

// 异步初始化认证状态
const auth = useAuthStore(pinia);
auth.initialize().then(() => {
  app.use(router);
  app.mount('#app');
}).catch((err) => {
  console.error('Failed to initialize auth:', err);
  // 即使初始化失败也要挂载应用
  app.use(router);
  app.mount('#app');
});

