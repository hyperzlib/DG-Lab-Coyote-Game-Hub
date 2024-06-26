import WebSocket from 'ws';

type BufferLike =
    | string
    | Buffer
    | DataView
    | number
    | ArrayBufferView
    | Uint8Array
    | ArrayBuffer
    | SharedArrayBuffer
    | readonly any[]
    | readonly number[]
    | { valueOf(): ArrayBuffer }
    | { valueOf(): SharedArrayBuffer }
    | { valueOf(): Uint8Array }
    | { valueOf(): readonly number[] }
    | { valueOf(): string }
    | { [Symbol.toPrimitive](hint: string): string };

export type WebSocketAsyncExtension = {
    sendAsync(data: BufferLike): Promise<void>;
    sendAsync(
        data: BufferLike,
        options: {
            mask?: boolean | undefined;
            binary?: boolean | undefined;
            compress?: boolean | undefined;
            fin?: boolean | undefined;
        }
    ): void;
    pingAsync(data?: any, mask?: boolean): Promise<void>;
    pongAsync(data?: any, mask?: boolean): Promise<void>;
}

export type AsyncWebSocket = WebSocket & WebSocketAsyncExtension;

export const wrapAsyncWebSocket = (ws: WebSocket): AsyncWebSocket => {
    const asyncWs = ws as WebSocket & WebSocketAsyncExtension;

    asyncWs.sendAsync = (...args: any[]) => {
        return new Promise((resolve, reject) => {
            const cb = (error?: Error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            };
            
            if (args.length === 1) {
                ws.send(args[0], cb);
            } else if (args.length === 2) {
                ws.send(args[0], args[1], cb);
            } else {
                reject(new Error('Invalid arguments'));
            }
        });
    };

    asyncWs.pingAsync = (data?: any, mask?: boolean) => {
        return new Promise((resolve, reject) => {
            ws.ping(data, mask, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    };

    asyncWs.pongAsync = (data?: any, mask?: boolean) => {
        return new Promise((resolve, reject) => {
            ws.pong(data, mask, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    };

    return asyncWs;
}