import { createApp } from 'vue'
import { createWebHashHistory, createRouter } from 'vue-router'

import 'virtual:windi.css'
import './style.scss'
import ViewerApp from './ViewerApp.vue';
import { chartRoutes } from './charts/chartRoutes';

const router = createRouter({
    history: createWebHashHistory(),
    routes: chartRoutes,
});

createApp(ViewerApp)
    .use(router)
    .mount('#app');