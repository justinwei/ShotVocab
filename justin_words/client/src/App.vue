<template>
  <div class="app-shell">
    <header class="app-header">
      <h1>背单词助手</h1>
      <nav class="app-nav">
        <RouterLink to="/" exact-active-class="active">复习</RouterLink>
        <RouterLink to="/upload" exact-active-class="active">录入</RouterLink>
        <RouterLink to="/stats" exact-active-class="active">统计</RouterLink>
        <RouterLink to="/library" exact-active-class="active">词库</RouterLink>
      </nav>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  padding: 1rem 1.25rem;
  background: #0f172a;
  color: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
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

.app-main {
  flex: 1;
  padding: 1rem;
}

@media (min-width: 768px) {
  .app-header {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}
</style>
