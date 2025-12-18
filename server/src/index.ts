import 'reflect-metadata'; // 反射元数据
import blocked from 'blocked-at';
import * as logger from 'loglevel';

import http from 'http';
import Koa from 'koa';
import { WebSocketServer } from 'ws';
import { Server as SocketIOServer } from 'socket.io';
import { EngineRequest } from './types/socket-io.js';
import KoaRouter from 'koa-router';
import serveStatic from "koa-static";
import koaLogger from 'koa-logger';
import { bodyParser } from '@koa/bodyparser';

import { WebSocketRouter } from './utils/WebSocketRouter.js';
import { setupWebSocketServer } from './utils/websocket.js';
import { createSwaggerRouter, setupRouter as initCommonRouter } from './router.js';
import { MainConfig } from './config.js';

// 加载Managers
import './managers/DGLabWSManager.js';
import './managers/CoyoteGameManager.js';
import { DGLabPulseService } from './services/DGLabPulse.js';
import { LocalIPAddress, openBrowser } from './utils/utils.js';
import { SiteNotificationService } from './services/SiteNotificationService.js';
import { checkUpdate } from './utils/checkUpdate.js';
import { CustomSkinService } from './services/CustomSkinService.js';
import { createDatabaseConnection } from './database.js';
import { CoyoteGameManager } from './managers/CoyoteGameManager.js';
import { ServerContext } from './types/server.js';
import { DGLabWSManager } from './managers/DGLabWSManager.js';
import { WebWSManager } from './managers/WebWSManager.js';

logger.setDefaultLevel(logger.levels.INFO); // 默认日志等级

async function main() {
    blocked((time, stack) => {
        logger.getLogger('Blocked Monitor').warn(`Blocked for ${time}ms, operation started here:`, stack);
    });

    await MainConfig.initialize();

    const app = new Koa();
    const httpServer = http.createServer(app.callback());
    
    const database = await createDatabaseConnection(MainConfig.value);
    app.context.database = database; // 将数据库连接挂载到Koa上下文中

    // 在HTTP服务器上创建WebSocket服务器
    const wsServer = new WebSocketServer({
        server: httpServer
    });

    const ioServer = new SocketIOServer(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    const serverContext = {
        database,
        ioServer
    } as ServerContext;

    httpServer.on('upgrade', (request, socket, head) => {
        // 将 /socket.io 的请求交给 Socket.IO 处理
        if (request.url && request.url.startsWith('/socket.io')) {
            ioServer.engine.handleUpgrade(request as unknown as EngineRequest, socket, head);
        } else {
            wsServer.handleUpgrade(request, socket, head, (ws) => {
                wsServer.emit('connection', ws, request);
            });
        }
    });
    await DGLabPulseService.instance.initialize();
    await SiteNotificationService.instance.initialize();
    await CustomSkinService.instance.initialize();

    await CoyoteGameManager.instance.initialize(serverContext);
    await DGLabWSManager.instance.initialize(serverContext);
    await WebWSManager.instance.initialize(serverContext);

    // 静态资源
    app.use(serveStatic('public'));

    // 中间件
    app.use(bodyParser());

    if (MainConfig.value.enableAccessLogger) {
        app.use(koaLogger());
    }

    const router = new KoaRouter();
    const wsRouter = new WebSocketRouter();

    // 初始化WebSocket路由拦截器
    setupWebSocketServer(wsServer, wsRouter);

    // 加载其他路由
    initCommonRouter(router, wsRouter);

    app.use(router.routes())
        .use(router.allowedMethods());

    // 加载控制器路由
    const swaggerRouter = createSwaggerRouter(MainConfig.value);
    app.use(swaggerRouter.routes())
        .use(swaggerRouter.allowedMethods());

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

        const serverLogger = logger.getLogger('Server');
        serverLogger.info(`Server is running at ${serverAddrStr}`);
        if (serverAddr && typeof serverAddr === 'object') {
            serverLogger.info(`You can access the console via: http://127.0.0.1:${serverAddr.port}`);

            // 自动打开浏览器
            if (MainConfig.value.openBrowser) {
                try {
                    openBrowser(`http://127.0.0.1:${serverAddr.port}`);
                } catch (err) {
                    serverLogger.error('Cannot open browser:', err);
                }
            }
        }

        serverLogger.info('Local IP Address List:');
        ipAddrList.forEach((ipAddr) => {
            serverLogger.info(`  - ${ipAddr}`);
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