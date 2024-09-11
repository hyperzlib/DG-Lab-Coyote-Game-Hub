import KoaRouter from 'koa-router';
import { WebSocketRouter } from './utils/WebSocketRouter';
import { DGLabWSManager } from './managers/DGLabWSManager';
import { WebController } from './controllers/http/Web';
import { WebWSManager } from './managers/WebWSManager';
import { GameApiController } from './controllers/http/GameApi';
import { Middleware } from './middlewares';

export const setupRouter = (router: KoaRouter, wsRouter: WebSocketRouter) => {
    router.get('/', WebController.index);
    router.get('/api/server_info', WebController.getServerInfo);
    router.get('/api/client/connect', WebController.getClientConnectInfo);

    router.get('/api/game', GameApiController.gameApiInfo);
    router.get('/api/game/:id', Middleware.acquireGameInstance, GameApiController.gameInfo);
    router.get('/api/game/:id/strength_config',
        Middleware.acquireGameInstance,
        GameApiController.getStrengthConfig);
    router.post('/api/game/:id/strength_config',
        Middleware.assertNotEmptyBody,
        Middleware.acquireGameList,
        GameApiController.setStrengthConfig);
    router.get('/api/game/:id/pulse_id',
        Middleware.acquireGameInstance,
        GameApiController.getPulseId);
    router.post('/api/game/:id/pulse_id',
        Middleware.assertNotEmptyBody,
        Middleware.acquireGameList,
        GameApiController.setPulseId);

    router.get('/api/game/:id/pulse_list',
        Middleware.acquireGameInstance,
        GameApiController.getPulseList);

    router.post('/api/game/:id/fire',
        Middleware.assertNotEmptyBody,
        Middleware.acquireGameList,
        GameApiController.fire);

    wsRouter.get('/ws', async (ws, req) => {
        WebWSManager.instance.handleWebSocket(ws, req);
    });

    wsRouter.get('/dglab_ws/:id', async (ws, req, routeParams) => {
        DGLabWSManager.instance.handleWebSocket(ws, req, routeParams);
    });
};