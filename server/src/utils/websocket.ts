import type { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import type { WebSocketRouter } from './WebSocketRouter.js';

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