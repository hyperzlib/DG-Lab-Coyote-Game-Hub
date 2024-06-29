import { createApp } from 'vue'

import 'virtual:windi.css'
import './style.scss'
import Viewer from './pages/Viewer.vue';

createApp(Viewer)
    .mount('#app');