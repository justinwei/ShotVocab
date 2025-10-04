<template>
  <section class="auth">
    <h2>{{ isRegister ? '注册新账户' : '登录' }}</h2>
    <p class="subtitle">使用电子邮箱管理你的词库数据</p>

    <form class="auth-form" @submit.prevent="submit">
      <label>
        邮箱
        <input
          v-model="email"
          type="email"
          inputmode="email"
          autocomplete="email"
          required
          placeholder="you@example.com"
        />
      </label>
      <label>
        密码
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          minlength="6"
          required
          placeholder="至少6位字符"
        />
      </label>
      <button class="primary" type="submit" :disabled="auth.loading">
        {{ auth.loading ? '请稍候...' : isRegister ? '创建账户' : '登录' }}
      </button>
    </form>

    <p v-if="auth.error" class="error">{{ auth.error }}</p>

    <p class="switch">
      {{ isRegister ? '已有账户？' : '还没有账户？' }}
      <button type="button" class="link" @click="toggleMode">
        {{ isRegister ? '改为登录' : '注册新账户' }}
      </button>
    </p>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const mode = ref('login');
const email = ref('');
const password = ref('');

const isRegister = computed(() => mode.value === 'register');

watch(mode, () => {
  auth.error = null;
});

function toggleMode() {
  mode.value = isRegister.value ? 'login' : 'register';
}

async function submit() {
  if (!email.value || !password.value) return;
  try {
    if (isRegister.value) {
      await auth.register({ email: email.value, password: password.value });
    } else {
      await auth.login({ email: email.value, password: password.value });
    }
    const target = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    router.replace(target || '/');
  } catch (error) {
    console.error('[LoginView] auth failed', error);
  }
}
</script>

<style scoped>
.auth {
  max-width: 360px;
  margin: 4rem auto;
  padding: 2rem;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.subtitle {
  margin: 0;
  color: #64748b;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.95rem;
  color: #1f2937;
}

input[type='email'],
input[type='password'] {
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border: 1px solid #cbd5f5;
  font-size: 1rem;
}

button {
  border: none;
  border-radius: 8px;
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

.switch {
  text-align: center;
  color: #475569;
}

.link {
  background: none;
  border: none;
  color: #0ea5e9;
  cursor: pointer;
  padding: 0;
  font-weight: 600;
}

.error {
  background: #fee2e2;
  color: #b91c1c;
  padding: 0.75rem 1rem;
  border-radius: 8px;
}
</style>
