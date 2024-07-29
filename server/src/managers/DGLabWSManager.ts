import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { IncomingMessage } from 'http';
import { wrapAsyncWebSocket } from '../utils/WebSocketAsync';
import { RetCode } from '../types/dg';
import { DGLabWSClient } from '../controllers/ws/DGLabWS';
import { OnExit } from '../utils/onExit';
import { EventDef, EventListenerFunc, EventRemoveAllFunc } from '../types/event';

export interface DGLabWSManagerEventsListener extends EventDef {
    clientConnected: [client: DGLabWSClient];
};

export class DGLabWSManager {
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
        
        const client = new DGLabWSClient(ws, clientId);
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

    public on: EventListenerFunc<DGLabWSManagerEventsListener> = this.events.on.bind(this.events);
    public once: EventListenerFunc<DGLabWSManagerEventsListener> = this.events.once.bind(this.events);
    public off: EventListenerFunc<DGLabWSManagerEventsListener> = this.events.off.bind(this.events);
    public removeAllListeners: EventRemoveAllFunc<DGLabWSManagerEventsListener> = this.events.removeAllListeners.bind(this.events);
}

DGLabWSManager.createInstance();