import { RouteRecordRaw } from 'vue-router';

export const chartRoutes: RouteRecordRaw[] = [
    {
        path: '/',
        component: () => import('./Circle1.vue'),
        name: '经典圆盘进度条',
        meta: {
            params: [
                {
                    prop: 'darkMode',
                    type: 'boolean',
                    name: '深色模式',
                },
            ],
        },
    },
    {
        path: '/bar1',
        component: () => import('./Bar1.vue'),
        name: '横向胶囊进度条',
    },
    {
        path: '/health-bar1',
        component: () => import('./HealthBar1.vue'),
        name: '像素心心HP条',
        meta: {
            params: [
                {
                    prop: 'textInverted',
                    type: 'boolean',
                    name: '白色文字',
                },
                {
                    prop: 'hideText',
                    type: 'boolean',
                    name: '隐藏文字',
                },
            ],
        },
    },
    {
        path: '/battery1',
        component: () => import('./Battery1.vue'), name: '拟物电池 (仅当前电量)',
        meta: {
            params: [
                {
                    prop: 'yellowBar',
                    type: 'boolean',
                    name: '黄色电量条',
                },
                {
                    prop: 'hideText',
                    type: 'boolean',
                    name: '隐藏文字',
                },
            ],
        },
    },
];