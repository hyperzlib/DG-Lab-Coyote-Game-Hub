import { EventEmitter } from 'events';
import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';

import { OnExit } from '#app/utils/onExit.js';
import { WebWSClient } from '#app/controllers/ws/WebWS.js';
import { wrapAsyncWebSocket } from '#app/utils/WebSocketAsync.js';
import { ServerContext } from '#app/types/server.js';

export interface WebWSManagerEventsListener {
    clientConnected: [client: WebWSClient];
}

export class WebWSManager {
    private ctx!: ServerContext;

    private static _instance: WebWSManager;

    private clientList: WebWSClient[] = [];

    private events = new EventEmitter<WebWSManagerEventsListener>();

    static createInstance() {
        if (!this._instance) {
            this._instance = new WebWSManager();

            // Add on exit handler
            OnExit.register(async () => {
                console.log('Exiting WebWSManager instance');
                await this._instance.destory();
            });
        }
    }

    static get instance(): WebWSManager {
        this.createInstance();
        return this._instance;
    }

    public async initialize(ctx: ServerContext): Promise<void> {
        this.ctx = ctx;
    }

    public async handleWebSocket(rawWs: WebSocket, req: IncomingMessage): Promise<void> {
        const ws = wrapAsyncWebSocket(rawWs);

        const client = new WebWSClient(this.ctx, ws);
        await client.initialize();

        this.clientList.push(client);
        
        this.events.emit('clientConnected', client);

        client.once('close', () => {
            this.clientList = this.clientList.filter((c) => c !== client);
        });
    }

    public async destory() {
        let promises: Promise<any>[] = [];

        for (const client of this.clientList) {
            promises.push(client.close());
        }

        try {
            await Promise.all(promises);
        } catch (error: any) {
            console.error('Failed to close all clients:', error);
        }

        this.clientList = [];

        this.events.removeAllListeners();
    }
    
    public on = this.events.on.bind(this.events);
    public once = this.events.once.bind(this.events);
    public off = this.events.off.bind(this.events);
    public removeAllListener = this.events.removeAllListeners.bind(this.events);
}
