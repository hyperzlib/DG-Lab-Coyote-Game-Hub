import { EventEmitter } from "events";
import { CoyoteGameController } from "../controllers/game/CoyoteGameController";
import { DGLabWSClient } from "../controllers/ws/DGLabWS";
import { DGLabWSManager } from "./DGLabWSManager";
import { LRUCache } from "lru-cache";
import { ExEventEmitter } from "../utils/ExEventEmitter";

export interface CoyoteGameManagerEvents {
    
}

export class CoyoteGameManager {
    private static _instance: CoyoteGameManager;

    private games: Map<string, CoyoteGameController>;

    private events = new ExEventEmitter<CoyoteGameManagerEvents>();

    /**
     * 缓存游戏配置信息，用于在断线重连时恢复游戏状态
     */
    public configCache: LRUCache<string, any> = new LRUCache({
        max: 1000,
        ttl: 1000 * 60 * 30, // 30 minutes
    });

    constructor() {
        this.games = new Map();

        DGLabWSManager.instance.on('clientConnected', (client) => this.handleCoyoteClientConnected(client));
    }

    public static createInstance() {
        if (!this._instance) {
            this._instance = new CoyoteGameManager();
        }
    }

    public static get instance() {
        this.createInstance();
        return this._instance;
    }

    public async handleCoyoteClientConnected(client: DGLabWSClient) {
        try {
            const game = await this.getOrCreateGame(client.clientId);
            await game.bindClient(client);
        } catch (error) {
            console.error('Failed to create game:', error);
        }
    }

    public async createGame(clientId: string) {
        const game = new CoyoteGameController(clientId);
        await game.initialize();

        game.once('close', () => {
            this.games.delete(clientId);
        });

        this.games.set(clientId, game);

        return game;
    }

    public getGame(clientId: string) {
        return this.games.get(clientId);
    }

    public async getOrCreateGame(clientId: string) {
        let game = this.getGame(clientId);
        if (!game) {
            game = await this.createGame(clientId);
        }

        return game;
    }

    public getGameList(): IterableIterator<CoyoteGameController> {
        return this.games.values();
    }

    public on = this.events.on.bind(this.events);
    public once = this.events.once.bind(this.events);
    public off = this.events.off.bind(this.events);
    public removeAllListeners = this.events.removeAllListeners.bind(this.events);
}

CoyoteGameManager.createInstance();