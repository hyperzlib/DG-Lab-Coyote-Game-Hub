import KoaRouter from 'koa-router';
import { WebSocketRouter } from './utils/WebSocketRouter';
import { DGLabWSManager } from './managers/DGLabWSManager';
import { WebController } from './controllers/http/Web';
import { WebWSManager } from './managers/WebWSManager';
import { GameApiController } from './controllers/http/GameApi';

export const setupRouter = (router: KoaRouter, wsRouter: WebSocketRouter) => {
    router.get('/', WebController.index);
    router.get('/api/server_info', WebController.getServerInfo);
    router.get('/api/client/connect', WebController.getClientConnectInfo);

    router.get('/api/game/:id', GameApiController.gameInfo);
    router.get('/api/game/:id/strength_config', GameApiController.getStrengthConfig);
    router.post('/api/game/:id/strength_config', GameApiController.setStrengthConfig);
    router.get('/api/game/:id/pulse_id', GameApiController.getPulseId);
    router.post('/api/game/:id/pulse_id', GameApiController.setPulseId);

    router.get('/api/game/:id/pulse_list', GameApiController.getPulseList);

    wsRouter.get('/ws', async (ws, req) => {
        WebWSManager.instance.handleWebSocket(ws, req);
    });

    wsRouter.get('/dglab_ws/:id', async (ws, req, routeParams) => {
        DGLabWSManager.instance.handleWebSocket(ws, req, routeParams);
    });
};