import http from 'http';
import Koa from 'koa';
import WebSocket from 'ws';
import KoaRouter from 'koa-router';
import cors from '@koa/cors';
import { WebSocketRouter } from './utils/WebSocketRouter';
import { setupWebSocketServer } from './utils/websocket';
import { setupRouter as initRouter } from './router';
import { MainConfig } from './config';
import serveStatic from "koa-static";
import bodyParser from '@koa/bodyparser';
import blocked from 'blocked-at';

// 加载Managers
import './managers/DGLabWSManager';
import './managers/CoyoteGameManager';
import { DGLabPulseService } from './services/DGLabPulse';
import { LocalIPAddress, openBrowser } from './utils/utils';
import { validator } from './utils/validator';
import { CoyoteGameConfigService } from './services/CoyoteGameConfigService';
import { SiteNotificationService } from './services/SiteNotificationService';
import { checkUpdate } from './utils/checkUpdate';
import { CustomSkinService } from './services/CustomSkinService';

async function main() {
    // blocked((time, stack) => {
    //     console.log(`Blocked for ${time}ms, operation started here:`, stack)
    // });

    await validator.initialize();
    await MainConfig.initialize();

    await DGLabPulseService.instance.initialize();
    await CoyoteGameConfigService.instance.initialize();
    await SiteNotificationService.instance.initialize();
    await CustomSkinService.instance.initialize();

    const app = new Koa();
    app.use(cors());
    const httpServer = http.createServer(app.callback());

    // 在HTTP服务器上创建WebSocket服务器
    const wsServer = new WebSocket.Server({
        server: httpServer
    });

    // 静态资源
    app.use(serveStatic('public'));

    // 中间件
    app.use(bodyParser());

    const router = new KoaRouter();
    const wsRouter = new WebSocketRouter();

    // 初始化WebSocket路由拦截器
    setupWebSocketServer(wsServer, wsRouter);

    // 加载路由
    initRouter(router, wsRouter);

    app.use(router.routes());

    httpServer.listen({
        port: MainConfig.value?.port ?? 8920,
        host: MainConfig.value?.host ?? 'localhost',
    }, () => {
        const serverAddr = httpServer.address();
        let serverAddrStr = '';
        const ipAddrList = LocalIPAddress.getIPAddrList();

        if (serverAddr && typeof serverAddr === 'object') {
            if (serverAddr.family.toLocaleLowerCase() === 'ipv4') {
                serverAddrStr = `http://${serverAddr.address}:${serverAddr.port}`;
            } else {
                serverAddrStr = `http://[${serverAddr.address}]:${serverAddr.port}`;
            }
        } else if (serverAddr && typeof serverAddr === 'string') {
            serverAddrStr = serverAddr;
        }

        console.log(`Server is running at ${serverAddrStr}`);
        if (serverAddr && typeof serverAddr === 'object') {
            console.log(`You can access the console via: http://127.0.0.1:${serverAddr.port}`);

            // 自动打开浏览器
            if (MainConfig.value.openBrowser) {
                try {
                    openBrowser(`http://127.0.0.1:${serverAddr.port}`);
                } catch (err) {
                    console.error('Cannot open browser:', err);
                }
            }
        }

        console.log('Local IP Address List:');
        ipAddrList.forEach((ipAddr) => {
            console.log(`  - ${ipAddr}`);
        });
    });

    // 检测更新
    checkUpdate().then((updateInfo) => {
        if (!updateInfo) return;

        if (MainConfig.value.hideWebUpdateNotification) return; // 不在控制台显示更新通知

        SiteNotificationService.instance.addNotification({
            severity: 'secondary',
            icon: 'pi pi-download',
            title: `发现新版本 ${updateInfo.version}`,
            message: updateInfo.description ?? '请前往GitHub查看更新内容。',
            url: updateInfo.downloadUrl,
            urlLabel: '下载',
            sticky: true,
            ignoreId: 'update-notification-' + updateInfo.version,
        });
    });
}

main().catch((err) => {
    console.error(err);
});