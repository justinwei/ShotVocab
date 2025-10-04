import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router/index.js';
import './assets/main.css';
import { useAuthStore } from './stores/auth.js';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

const auth = useAuthStore(pinia);
await auth.initialize();

app.use(router);
app.mount('#app');
