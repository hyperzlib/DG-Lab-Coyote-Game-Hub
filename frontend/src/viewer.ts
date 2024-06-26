import { createApp } from 'vue'
import { createWebHistory, createRouter, RouteRecordRaw } from 'vue-router'

import PrimeVue from 'primevue/config';
import { definePreset } from '@primevue/themes';
import Aura from '@primevue/themes/aura';

import 'virtual:windi.css'
import 'primeicons/primeicons.css'
import './style.scss'
import App from './App.vue'

const appName = '战败惩罚';

const routes: RouteRecordRaw[] = [
    { path: '/', component: () => import('./pages/Controller.vue'), name: '控制器' },
    { path: '/view', component: () => import('./pages/Viewer.vue'), name: '状态' },
];

const router = createRouter({
    history: createWebHistory('/'),
    routes,
});

router.beforeEach((to, _, next) => {
    document.title = to.name?.toString() + ' - ' + appName;
    next();
});


const SeitaPreset = definePreset(Aura, {
    semantic: {
        primary: {
            50: '{blue.50}',
            100: '{blue.100}',
            200: '{blue.200}',
            300: '{blue.300}',
            400: '{blue.400}',
            500: '{blue.500}',
            600: '{blue.600}',
            700: '{blue.700}',
            800: '{blue.800}',
            900: '{blue.900}',
            950: '{blue.950}'
        }
    }
});

createApp(App)
    .use(router)
    .use(PrimeVue, {
        theme: {
            preset: SeitaPreset,
        },
    })
    .mount('#app');