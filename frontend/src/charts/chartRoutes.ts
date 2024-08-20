import { RouteRecordRaw } from 'vue-router';

export const chartRoutes: RouteRecordRaw[] = [
    { path: '/', component: () => import('./Circle1.vue'), name: '圆形1' },
    { path: '/circle1-dark', component: () => import('./Circle1.vue'), name: '圆形1 (深色)', props: { darkMode: true } },
    { path: '/bar1', component: () => import('./Bar1.vue'), name: '进度条1' },
    { path: '/health-bar1', component: () => import('./HealthBar1.vue'), name: 'HP条1' },
    { path: '/health-bar1-invert', component: () => import('./HealthBar1.vue'), name: 'HP条1 (白色文字)', props: { textInverted: true } },
    { path: '/health-bar1-notext', component: () => import('./HealthBar1.vue'), name: 'HP条1 (隐藏文字)', props: { hideText: true } },
];