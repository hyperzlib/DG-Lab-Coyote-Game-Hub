import { EventEmitter } from 'events';
import { OnExit } from '../utils/onExit';
import { WebWSClient } from '../controllers/ws/WebWS';

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
