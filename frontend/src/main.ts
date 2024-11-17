import { createApp } from 'vue'
import { createWebHashHistory, createRouter, RouteRecordRaw } from 'vue-router'

import PrimeVue from 'primevue/config';
import { definePreset } from '@primevue/themes';
import Aura from '@primevue/themes/aura';

import DialogService from 'primevue/dialogservice';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';

import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

import 'virtual:windi.css'
import 'primeicons/primeicons.css'
import './style.scss'
import App from './App.vue'

const appName = '战败惩罚';

const routes: RouteRecordRaw[] = [
    {
        path: '/', component: () => import('./pages/Controller.vue'), name: '控制器',
        children: [
            { path: '', redirect: 'strength' },
            { path: 'strength', component: () => import('./pages/controller/StrengthSettings.vue'), name: '控制器 - 强度设置' },
            { path: 'pulse', component: () => import('./pages/controller/PulseSettings.vue'), name: '控制器 - 波形设置' },
            { path: 'game', component: () => import('./pages/controller/GameConnection.vue'), name: '控制器 - 游戏连接' },
        ],
    },
];

const router = createRouter({
    history: createWebHashHistory(),
    routes,
});

router.beforeEach((to, _, next) => {
    document.title = to.name?.toString() + ' - ' + appName;
    next();
});


const SeitaPreset = definePreset(Aura, {
    semantic: {
        primary: {
            50: '{zinc.50}',
            100: '{zinc.100}',
            200: '{zinc.200}',
            300: '{zinc.300}',
            400: '{zinc.400}',
            500: '{zinc.500}',
            600: '{zinc.600}',
            700: '{zinc.700}',
            800: '{zinc.800}',
            900: '{zinc.900}',
            950: '{zinc.950}'
        },
        colorScheme: {
            light: {
                primary: {
                    color: '{zinc.950}',
                    inverseColor: '#ffffff',
                    hoverColor: '{zinc.900}',
                    activeColor: '{zinc.800}'
                },
                highlight: {
                    background: '{zinc.950}',
                    focusBackground: '{zinc.700}',
                    color: '#ffffff',
                    focusColor: '#ffffff'
                }
            },
            dark: {
                primary: {
                    color: '{zinc.50}',
                    inverseColor: '{zinc.950}',
                    hoverColor: '{zinc.100}',
                    activeColor: '{zinc.200}'
                },
                highlight: {
                    background: 'rgba(250, 250, 250, .16)',
                    focusBackground: 'rgba(250, 250, 250, .24)',
                    color: 'rgba(255,255,255,.87)',
                    focusColor: 'rgba(255,255,255,.87)'
                }
            }
        }
    }
});

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

createApp(App)
    .use(router)
    .use(pinia)
    .use(PrimeVue, {
        theme: {
            preset: SeitaPreset,
        },
    })
    .use(DialogService)
    .use(ToastService)
    .use(ConfirmationService)
    .directive('ripple', {}) // Bypass PrimeVue's ripple directive
    .mount('#app');