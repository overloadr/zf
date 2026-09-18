import { createRouter, createWebHistory } from 'vue-router'
import HomePage from './pages/HomePage.vue'
import CreatePage from './pages/CreatePage.vue'
import MatchPage from './pages/MatchPage.vue'
import HistoryPage from './pages/HistoryPage.vue'
import StatsPage from './pages/StatsPage.vue'
import MatchStatsPage from './pages/MatchStatsPage.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomePage },
    { path: '/new', component: CreatePage },
    { path: '/history', component: HistoryPage },
    { path: '/stats', component: StatsPage },
    { path: '/m/:code', component: MatchPage },
    { path: '/m/:code/stats', component: MatchStatsPage },
  ],
})
