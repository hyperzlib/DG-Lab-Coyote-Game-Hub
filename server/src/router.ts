import KoaRouter from 'koa-router';
import { WebSocketRouter } from './utils/WebSocketRouter';
import { DGLabWSManager } from './managers/DGLabWSManager';
import { WebController } from './controllers/http/Web';
import { WebWSManager } from './managers/WebWSManager';

export const setupRouter = (router: KoaRouter, wsRouter: WebSocketRouter) => {
    router.get('/', WebController.index);
    router.get('/api/server_info', WebController.getServerInfo);
    router.get('/api/client/connect', WebController.getClientConnectInfo);

    wsRouter.get('/ws', async (ws, req) => {
        WebWSManager.instance.handleWebSocket(ws, req);
    });

    wsRouter.get('/dglab_ws/:id', async (ws, req, routeParams) => {
        DGLabWSManager.instance.handleWebSocket(ws, req, routeParams);
    });
};