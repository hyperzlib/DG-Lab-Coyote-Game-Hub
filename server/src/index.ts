import http from 'http';
import Koa from 'koa';
import WebSocket from 'ws';
import KoaRouter from 'koa-router';
import { WebSocketRouter } from './utils/WebSocketRouter';
import { setupWebSocketServer } from './utils/websocket';
import { setupRouter as initRouter } from './router';
import { MainConfig } from './config';

// 加载Managers
import './managers/DGLabWSManager';
import './managers/CoyoteLiveGameManager';
import { DGLabPulseService } from './services/DGLabPulse';
import { LocalIPAddress } from './utils/utils';
import { validator } from './utils/validator';

async function main() {
    await validator.initialize();
    await MainConfig.initialize();
    
    await DGLabPulseService.instance.initialize();

    const app = new Koa();
    const httpServer = http.createServer(app.callback());

    const wsServer = new WebSocket.Server({ // 同一个端口监听不同的服务
        server: httpServer
    });

    const router = new KoaRouter();
    const wsRouter = new WebSocketRouter();

    setupWebSocketServer(wsServer, wsRouter);

    initRouter(router, wsRouter);

    app.use(router.routes());

    httpServer.listen({
        port: MainConfig.value?.port ?? 8920,
        host: MainConfig.value?.host ?? 'localhost'
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

        console.log('Local IP Address List:');
        ipAddrList.forEach((ipAddr) => {
            console.log(`  - ${ipAddr}`);
        });
    });
}

main().catch((err) => {
    console.error(err);
});