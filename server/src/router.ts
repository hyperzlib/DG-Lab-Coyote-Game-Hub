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

    router.get('/api/game', GameApiController.gameApiInfo);

    // v1
    router.get('/api/game/:id', GameApiController.gameInfo);
    router.get('/api/game/:id/strength_config', GameApiController.getGameStrength);
    router.post('/api/game/:id/strength_config', GameApiController.setGameStrength);
    router.get('/api/game/:id/pulse_id', GameApiController.getPulseId);
    router.post('/api/game/:id/pulse_id', GameApiController.setPulseId);
    router.get('/api/game/:id/pulse_list', GameApiController.getPulseList);

    router.post('/api/game/:id/fire', GameApiController.startActionFire);

    // v2
    router.get('/api/v2/pulse_list', GameApiController.getPulseList);
    router.get('/api/v2/game/:id', GameApiController.gameInfo);
    router.get('/api/v2/game/:id/strength', GameApiController.getGameStrength);
    router.post('/api/v2/game/:id/strength', GameApiController.setGameStrength);
    router.get('/api/v2/game/:id/pulse', GameApiController.getPulseId);
    router.post('/api/v2/game/:id/pulse', GameApiController.setPulseId);
    router.get('/api/v2/game/:id/pulse_list', GameApiController.getPulseList);

    router.post('/api/v2/game/:id/action/fire', GameApiController.startActionFire);

    wsRouter.get('/ws', async (ws, req) => {
        WebWSManager.instance.handleWebSocket(ws, req);
    });

    wsRouter.get('/dglab_ws/:id', async (ws, req, routeParams) => {
        DGLabWSManager.instance.handleWebSocket(ws, req, routeParams);
    });
};