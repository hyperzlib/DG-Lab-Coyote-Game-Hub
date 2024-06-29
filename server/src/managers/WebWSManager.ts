import { EventEmitter } from 'events';
import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';

import { OnExit } from '../utils/onExit';
import { WebWSClient } from '../controllers/ws/WebWS';
import { wrapAsyncWebSocket } from '../utils/WebSocketAsync';

export interface WebWSManagerEventsListener {
    (name: 'clientConnected', listener: (client: WebWSClient) => void): void;
}

export class WebWSManager {
    private static _instance: WebWSManager;

    private clientList: WebWSClient[] = [];

    private events: EventEmitter = new EventEmitter();

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

    public on: WebWSManagerEventsListener = this.events.on.bind(this.events);
    public once: WebWSManagerEventsListener = this.events.once.bind(this.events);
    public off = this.events.off.bind(this.events);

    public async handleWebSocket(rawWs: WebSocket, req: IncomingMessage): Promise<void> {
        const ws = wrapAsyncWebSocket(rawWs);

        const client = new WebWSClient(ws);
        await client.initialize();

        this.clientList.push(client);
        
        this.events.emit('clientConnected', client);

        client.on('close', () => {
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
}
