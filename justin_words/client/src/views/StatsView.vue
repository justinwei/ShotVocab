<template>
  <section class="stats">
    <header class="stats__header">
      <h2>学习统计</h2>
      <button @click="refresh" :disabled="store.loading">刷新</button>
    </header>

    <p class="subtitle">追踪每日新增与复习数量，观察遗忘曲线执行情况。</p>

    <div v-if="store.loading" class="status">加载中...</div>
    <div v-else-if="store.error" class="status error">{{ store.error }}</div>

    <ul v-if="store.items.length" class="list">
      <li v-for="item in store.items" :key="item.day">
        <div class="day">{{ item.day }}</div>
        <div class="metrics">
          <span class="metric new">新增 {{ item.newWords }}</span>
          <span class="metric review">复习 {{ item.reviewsCompleted }}</span>
        </div>
      </li>
    </ul>

    <div v-else-if="!store.loading" class="empty">暂无统计数据，先去完成一次复习吧。</div>
  </section>
</template>

<script setup>
import { onMounted } from 'vue';
import { useStatsStore } from '../stores/stats.js';

const store = useStatsStore();

onMounted(() => {
  if (!store.items.length) {
    store.fetchRange();
  }
});

function refresh() {
  store.fetchRange();
}
</script>

<style scoped>
.stats {
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.stats__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.subtitle {
  margin: 0;
  color: #64748b;
  font-size: 0.95rem;
}

button {
  border: none;
  border-radius: 8px;
  background: #e2e8f0;
  color: #1e293b;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.status {
  font-size: 0.9rem;
  color: #475569;
}

.status.error {
  color: #ef4444;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.list li {
  background: #fff;
  border-radius: 12px;
  padding: 1rem 1.25rem;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.day {
  font-weight: 600;
  color: #0f172a;
}

.metrics {
  display: flex;
  gap: 0.75rem;
}

.metric {
  font-size: 0.95rem;
}

.metric.new {
  color: #0ea5e9;
}

.metric.review {
  color: #10b981;
}

.empty {
  background: #fff;
  border-radius: 12px;
  padding: 2rem;
  text-align: center;
  color: #64748b;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
}
</style>
