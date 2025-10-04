import { createRouter, createWebHistory } from 'vue-router';
import StudyView from '../views/StudyView.vue';
import UploadView from '../views/UploadView.vue';
import StatsView from '../views/StatsView.vue';
import LibraryView from '../views/LibraryView.vue';
import LoginView from '../views/LoginView.vue';
import { useAuthStore } from '../stores/auth.js';

const routes = [
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    name: 'study',
    component: StudyView,
    meta: { requiresAuth: true }
  },
  {
    path: '/upload',
    name: 'upload',
    component: UploadView,
    meta: { requiresAuth: true }
  },
  {
    path: '/stats',
    name: 'stats',
    component: StatsView,
    meta: { requiresAuth: true }
  },
  {
    path: '/library',
    name: 'library',
    component: LibraryView,
    meta: { requiresAuth: true }
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.initialized) {
    await auth.initialize();
  }

  if (to.meta.requiresAuth !== false && !auth.isAuthenticated) {
    return {
      path: '/login',
      query: { redirect: to.fullPath }
    };
  }

  if (to.name === 'login' && auth.isAuthenticated) {
    const target = to.query.redirect;
    return target ? { path: target } : { path: '/' };
  }

  return true;
});

export default router;
