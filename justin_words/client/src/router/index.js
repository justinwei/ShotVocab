import { createRouter, createWebHistory } from 'vue-router';
import StudyView from '../views/StudyView.vue';
import UploadView from '../views/UploadView.vue';
import StatsView from '../views/StatsView.vue';
import LibraryView from '../views/LibraryView.vue';

const routes = [
  {
    path: '/',
    name: 'study',
    component: StudyView
  },
  {
    path: '/upload',
    name: 'upload',
    component: UploadView
  },
  {
    path: '/stats',
    name: 'stats',
    component: StatsView
  },
  {
    path: '/library',
    name: 'library',
    component: LibraryView
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;
