import { EventEmitter } from 'events';
import { OnExit } from '../utils/onExit';
export class WebWSManager {
    static _instance;
    clientList = [];
    events = new EventEmitter();
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
    static get instance() {
        this.createInstance();
        return this._instance;
    }
    async destory() {
        let promises = [];
        for (const client of this.clientList) {
            promises.push(client.close());
        }
        try {
            await Promise.all(promises);
        }
        catch (error) {
            console.error('Failed to close all clients:', error);
        }
        this.clientList = [];
        this.events.removeAllListeners();
    }
}
