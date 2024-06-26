import { EventEmitter } from "events";
import { CoyoteLiveGame } from "../controllers/game/CoyoteLiveGame";
import { DGLabWSManager } from "./DGLabWSManager";
import { LRUCache } from "lru-cache";
export class CoyoteLiveGameManager {
    static _instance;
    games;
    events = new EventEmitter();
    /**
     * 缓存游戏配置信息，用于在断线重连时恢复游戏状态
     */
    configCache = new LRUCache({
        max: 1000,
        ttl: 1000 * 60 * 30, // 30 minutes
    });
    constructor() {
        this.games = new Map();
        DGLabWSManager.instance.on('clientConnected', (client) => {
            this.createGame(client).catch((error) => {
                console.error('Failed to create game:', error);
            });
        });
    }
    static createInstance() {
        if (!this._instance) {
            this._instance = new CoyoteLiveGameManager();
        }
    }
    static get instance() {
        this.createInstance();
        return this._instance;
    }
    async createGame(client) {
        const game = new CoyoteLiveGame(client);
        await game.initialize();
        this.games.set(client.clientId, game);
    }
    getGame(clientId) {
        return this.games.get(clientId);
    }
    on = this.events.on;
    once = this.events.once;
    off = this.events.off;
}
CoyoteLiveGameManager.createInstance();
