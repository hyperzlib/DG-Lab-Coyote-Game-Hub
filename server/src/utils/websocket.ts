import WebSocket, { WebSocketServer } from 'ws';
import { WebSocketRouter } from './WebSocketRouter.js';

export const setupWebSocketServer = (wsServer: WebSocketServer, router: WebSocketRouter) => {
    wsServer.on('connection', (ws, req) => {
        const url = req.url;
        if (url) {
            const result = router.match(url);
            if (result) {
                result.route.callback(ws, req, result.params);
            } else {
                ws.close();
            }
        }
    });

    return wsServer;
};