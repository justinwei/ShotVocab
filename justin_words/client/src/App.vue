<template>
  <div class="app-shell">
    <header v-if="auth.isAuthenticated" class="app-header">
      <div class="brand">
        <h1>背单词助手</h1>
        <nav class="app-nav">
          <RouterLink to="/" exact-active-class="active">复习</RouterLink>
          <RouterLink to="/upload" exact-active-class="active">录入</RouterLink>
          <RouterLink to="/stats" exact-active-class="active">统计</RouterLink>
          <RouterLink to="/library" exact-active-class="active">词库</RouterLink>
        </nav>
      </div>
      <div class="user" ref="menuRef">
        <button type="button" class="avatar" @click="toggleMenu" aria-label="账户菜单">
          {{ initials }}
        </button>
        <div v-if="showMenu" class="user-menu">
          <span class="user-email">{{ auth.user?.email }}</span>
          <button type="button" class="menu-logout" @click="handleLogout">退出</button>
        </div>
      </div>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useAuthStore } from './stores/auth.js';

const auth = useAuthStore();
const showMenu = ref(false);
const menuRef = ref(null);

const initials = computed(() => {
  const email = auth.user?.email;
  if (!email) return '👤';
  const first = email.trim()[0];
  return first ? first.toUpperCase() : '👤';
});

function toggleMenu() {
  showMenu.value = !showMenu.value;
}

function handleLogout() {
  showMenu.value = false;
  auth.logout();
}

function handleClickOutside(event) {
  if (!menuRef.value) return;
  if (!menuRef.value.contains(event.target)) {
    showMenu.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}


.app-header {
  position: relative;
  padding: 1rem 3.75rem 1rem 1.25rem;
  background: #0f172a;
  color: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.brand {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.app-header h1 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
}

.app-nav {
  display: flex;
  gap: 1rem;
  font-size: 0.95rem;
}

.app-nav a {
  color: rgba(248, 250, 252, 0.7);
  padding-bottom: 0.25rem;
  border-bottom: 2px solid transparent;
}

.app-nav a.active {
  color: #f8fafc;
  border-bottom-color: #38bdf8;
}

.user {
  position: absolute;
  top: 1rem;
  right: 1.25rem;
  display: flex;
  align-items: center;
}

.avatar {
  background: rgba(248, 250, 252, 0.1);
  border: 1px solid rgba(248, 250, 252, 0.24);
  color: #f8fafc;
  border-radius: 50%;
  width: 2.25rem;
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  cursor: pointer;
}

.avatar:hover {
  background: rgba(248, 250, 252, 0.2);
}

.user-menu {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  background: #1e293b;
  color: #f8fafc;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  min-width: 180px;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.25);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  z-index: 10;
}

.user-email {
  font-size: 0.9rem;
  word-break: break-all;
  opacity: 0.85;
}

.menu-logout {
  border: none;
  border-radius: 999px;
  padding: 0.4rem 0.9rem;
  background: rgba(248, 250, 252, 0.1);
  color: #f8fafc;
  cursor: pointer;
  font-weight: 600;
}

.menu-logout:hover {
  background: rgba(248, 250, 252, 0.3);
}

.app-main {
  flex: 1;
  padding: 1rem;
}

@media (min-width: 768px) {
  .app-header {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
  }

  .brand {
    flex-direction: row;
    align-items: center;
    gap: 1.5rem;
  }

  .user {
    position: relative;
    top: auto;
    right: auto;
  }
}
</style>
