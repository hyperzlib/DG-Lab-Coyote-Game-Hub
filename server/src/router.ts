import KoaRouter from 'koa-router';
import { SwaggerRouter } from 'koa-swagger-decorator';
import { WebSocketRouter } from './utils/WebSocketRouter.js';
import { DGLabWSManager } from './managers/DGLabWSManager.js';
import { WebController } from './controllers/http/Web.js';
import { WebWSManager } from './managers/WebWSManager.js';
import { MainConfigType } from './types/config.js';
import { GameApiController } from './controllers/http/GameApi.js';

export const createSwaggerRouter = (config: MainConfigType) => {
    let publicUrl = config.webBaseUrl || `http://localhost:${config.port}`;

    const swaggerRouter = new SwaggerRouter({
        spec: {
            info: {
                title: 'Coyote Game Hub API',
                description: '用于控制郊狼的API',
                version: '1.0.0',
            },
            servers: [
                {
                    url: publicUrl,
                    description: 'Primary',
                }
            ],
            security: [
                {
                    BearerAuth: []
                }
            ],
        },
        swaggerHtmlEndpoint: '/api/docs',
        swaggerJsonEndpoint: '/api/openapi.json',
    });

    swaggerRouter.swagger();

    swaggerRouter.applyRoute(WebController);
    swaggerRouter.applyRoute(GameApiController);

    return swaggerRouter;
};

export const setupRouter = (router: KoaRouter, wsRouter: WebSocketRouter) => {
    // router.get('/', WebController.index);
    // router.get('/api/server_info', WebController.getServerInfo);
    // router.get('/api/client/connect', WebController.getClientConnectInfo);
    // router.get('/api/custom_skins', WebController.getCustomSkinList);

    // router.get('/api/game', GameApiController.gameApiInfo);

    // // v1
    // router.get('/api/game/:id', GameApiController.gameInfo);
    // router.get('/api/game/:id/strength_config', GameApiController.getGameStrength);
    // router.post('/api/game/:id/strength_config', GameApiController.setGameStrength);
    // router.get('/api/game/:id/pulse_id', GameApiController.getPulseId);
    // router.post('/api/game/:id/pulse_id', GameApiController.setPulseId);
    // router.get('/api/game/:id/pulse_list', GameApiController.getPulseList);

    // router.post('/api/game/:id/fire', GameApiController.startActionFire);

    // // v2
    // router.get('/api/v2/pulse_list', GameApiController.getPulseList);
    // router.post('/api/v2/pair_game', WebController.notImplemented);

    // router.get('/api/v2/game/:id', GameApiController.gameInfo);
    // router.get('/api/v2/game/:id/strength', GameApiController.getGameStrength);
    // router.post('/api/v2/game/:id/strength', GameApiController.setGameStrength);
    // router.get('/api/v2/game/:id/pulse', GameApiController.getPulseId);
    // router.post('/api/v2/game/:id/pulse', GameApiController.setPulseId);
    // router.get('/api/v2/game/:id/pulse_list', GameApiController.getPulseList);

    // router.post('/api/v2/game/:id/action/fire', GameApiController.startActionFire);

    // router.post('/api/v2/game/:id/gameplay/init', WebController.notImplemented);
    // router.post('/api/v2/game/:id/gameplay/:gameplayid/event/emit', WebController.notImplemented);

    wsRouter.get('/ws', async (ws, req) => {
        WebWSManager.instance.handleWebSocket(ws, req);
    });

    wsRouter.get('/dglab_ws/:id', async (ws, req, routeParams) => {
        DGLabWSManager.instance.handleWebSocket(ws, req, routeParams);
    });
};