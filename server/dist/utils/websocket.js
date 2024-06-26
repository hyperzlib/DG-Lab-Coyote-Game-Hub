export const setupWebSocketServer = (wsServer, router) => {
    wsServer.on('connection', (ws, req) => {
        const url = req.url;
        if (url) {
            const result = router.match(url);
            if (result) {
                result.route.callback(ws, req, result.params);
            }
            else {
                ws.close();
            }
        }
    });
    return wsServer;
};
