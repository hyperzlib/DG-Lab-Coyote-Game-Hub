import { EventEmitter } from 'events';
import { wrapAsyncWebSocket } from '../utils/WebSocketAsync';
import { RetCode } from '../types/dg';
import { DGLabWSClient } from '../controllers/ws/DGLabWS';
import { OnExit } from '../utils/onExit';
export class DGLabWSManager {
    static _instance;
    clientIdToClient = new Map();
    events = new EventEmitter();
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
    static get instance() {
        this.createInstance();
        return this._instance;
    }
    async handleWebSocket(rawWs, req, routeParams) {
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
    getClient(clientId) {
        return this.clientIdToClient.get(clientId);
    }
    async destory() {
        let promises = [];
        for (const client of this.clientIdToClient.values()) {
            promises.push(client.close());
        }
        try {
            await Promise.all(promises);
        }
        catch (error) {
            console.error('Failed to close all clients:', error);
        }
        this.clientIdToClient.clear();
        this.events.removeAllListeners();
    }
    on = this.events.on.bind(this.events);
    once = this.events.once.bind(this.events);
    off = this.events.off.bind(this.events);
}
DGLabWSManager.createInstance();
