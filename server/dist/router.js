import { DGLabWSManager } from './managers/DGLabWSManager';
import { WebController } from './controllers/http/Web';
export const setupRouter = (router, wsRouter) => {
    router.get('/client/connect', WebController.getClientConnectInfo);
    wsRouter.get('/dglab_ws/:id', async (ws, req, routeParams) => {
        DGLabWSManager.instance.handleWebSocket(ws, req, routeParams);
    });
};
