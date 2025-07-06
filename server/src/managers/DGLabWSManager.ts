import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { IncomingMessage } from 'http';
import { wrapAsyncWebSocket } from '#app/utils/WebSocketAsync.js';
import { RetCode } from '#app/types/dg.js';
import { DGLabWSClient } from '#app/controllers/ws/DGLabWS.js';
import { OnExit } from '#app/utils/onExit.js';
import { Config, MainConfig } from '#app/config.js';
import { ServerContext } from '#app/types/server.js';

export interface DGLabWSManagerEventsListener {
    clientConnected: [client: DGLabWSClient];
};

export class DGLabWSManager {
    private ctx!: ServerContext;

    private static _instance: DGLabWSManager;

    private clientIdToClient: Map<string, DGLabWSClient> = new Map();

    private events = new EventEmitter<DGLabWSManagerEventsListener>();

    static createInstance() {
        if (!this._instance) {
            this._instance = new DGLabWSManager();

            // Add on exit handler
            OnExit.register(async () => {
                console.log('Exiting DGLabWSManager instance');
                await this._instance.destory();
            });
        }
    }

    static get instance(): DGLabWSManager {
        this.createInstance();
        return this._instance;
    }

    public async initialize(ctx: ServerContext): Promise<void> {
        this.ctx = ctx;
    }

    async handleWebSocket(rawWs: WebSocket, req: IncomingMessage, routeParams: Record<string, string>): Promise<void> {
        const clientId = routeParams.id;

        const ws = wrapAsyncWebSocket(rawWs);

        if (!clientId) {
            await ws.sendAsync(JSON.stringify({
                type: 'error',
                clientId: '',
                targetId: '',
                message: RetCode.INVALID_CLIENT_ID,
            }));
            ws.close();
            return;
        }

        if (this.clientIdToClient.has(clientId)) {
            await ws.sendAsync(JSON.stringify({
                type: 'error',
                clientId: clientId,
                targetId: '',
                message: RetCode.ID_ALREADY_BOUND,
            }));
            ws.close();
            return;
        }

        if (MainConfig.value.allowBroadcastToClients && this.clientIdToClient.size > 10) {
            // 单机模式下，只允许连接10个客户端
            await ws.sendAsync(JSON.stringify({
                type: 'error',
                clientId: clientId,
                targetId: '',
                message: RetCode.ID_ALREADY_BOUND,
            }));
            console.log('Too many clients connected, reject client:', clientId);
            console.log('If you are running this program as a public server, please set allowBroadcastToClients to false in config.yaml');
        }
        
        const client = new DGLabWSClient(this.ctx, ws, clientId);
        await client.initialize();
        
        this.events.emit('clientConnected', client);

        // Add bindings
        this.clientIdToClient.set(clientId, client);

        client.once('close', async () => {
            this.clientIdToClient.delete(client.clientId);
        });
    }

    getClient(clientId: string): DGLabWSClient | undefined {
        return this.clientIdToClient.get(clientId);
    }

    async destory(): Promise<void> {
        let promises: Promise<any>[] = [];
        for (const client of this.clientIdToClient.values()) {
            promises.push(client.close());
        }

        try {
            await Promise.all(promises);
        } catch (error: any) {
            console.error('Failed to close all clients:', error);
        }

        this.clientIdToClient.clear();

        this.events.removeAllListeners();
    }

    public on = this.events.on.bind(this.events);
    public once = this.events.once.bind(this.events);
    public off = this.events.off.bind(this.events);
    public removeAllListeners = this.events.removeAllListeners.bind(this.events);
}

DGLabWSManager.createInstance();