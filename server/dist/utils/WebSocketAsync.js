export const wrapAsyncWebSocket = (ws) => {
    const asyncWs = ws;
    asyncWs.sendAsync = (...args) => {
        return new Promise((resolve, reject) => {
            const cb = (error) => {
                if (error) {
                    reject(error);
                }
                else {
                    resolve();
                }
            };
            if (args.length === 1) {
                ws.send(args[0], cb);
            }
            else if (args.length === 2) {
                ws.send(args[0], args[1], cb);
            }
            else {
                reject(new Error('Invalid arguments'));
            }
        });
    };
    asyncWs.pingAsync = (data, mask) => {
        return new Promise((resolve, reject) => {
            ws.ping(data, mask, (error) => {
                if (error) {
                    reject(error);
                }
                else {
                    resolve();
                }
            });
        });
    };
    asyncWs.pongAsync = (data, mask) => {
        return new Promise((resolve, reject) => {
            ws.pong(data, mask, (error) => {
                if (error) {
                    reject(error);
                }
                else {
                    resolve();
                }
            });
        });
    };
    return asyncWs;
};
