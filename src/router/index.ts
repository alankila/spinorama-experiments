import { createRouter, createWebHistory } from 'vue-router'
import SpeakerView from '../views/SpeakerView.vue'
import SpeakerListView from '@/views/SpeakerListView.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: SpeakerListView,
    },
    {
      path: '/view/:speakerId/:measurementId/',
      component: SpeakerView,
      props: true,
    },
  ],
});

export default router;
