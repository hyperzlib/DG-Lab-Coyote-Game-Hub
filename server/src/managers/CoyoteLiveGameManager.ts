import { EventEmitter } from "events";
import { CoyoteLiveGame } from "../controllers/game/CoyoteLiveGame";
import { DGLabWSClient } from "../controllers/ws/DGLabWS";
import { DGLabWSManager } from "./DGLabWSManager";
import { LRUCache } from "lru-cache";
import { EventDef, EventListenerFunc, EventRemoveAllFunc } from "../types/event";

export interface CoyoteLiveGameManagerEvents extends EventDef {
    gameCreated: [clientId: string, game: CoyoteLiveGame];
}

export class CoyoteLiveGameManager {
    private static _instance: CoyoteLiveGameManager;

    private games: Map<string, CoyoteLiveGame>;

    private events = new EventEmitter<CoyoteLiveGameManagerEvents>();

    /**
     * 缓存游戏配置信息，用于在断线重连时恢复游戏状态
     */
    public configCache: LRUCache<string, any> = new LRUCache({
        max: 1000,
        ttl: 1000 * 60 * 30, // 30 minutes
    });

    constructor() {
        this.games = new Map();

        DGLabWSManager.instance.on('clientConnected', (client) => this.handleClientConnected(client));
    }

    public static createInstance() {
        if (!this._instance) {
            this._instance = new CoyoteLiveGameManager();
        }
    }

    public static get instance() {
        this.createInstance();
        return this._instance;
    }

    public async handleClientConnected(client: DGLabWSClient) {
        try {
            const game = await this.createGame(client);
            this.events.emit('gameCreated', client.clientId, game);
        } catch (error) {
            console.error('Failed to create game:', error);
        }
    }

    public async createGame(client: DGLabWSClient) {
        const game = new CoyoteLiveGame(client);
        await game.initialize();

        this.games.set(client.clientId, game);

        return game;
    }

    public getGame(clientId: string) {
        return this.games.get(clientId);
    }

    public getGameList(): IterableIterator<CoyoteLiveGame> {
        return this.games.values();
    }

    public on: EventListenerFunc<CoyoteLiveGameManagerEvents> = this.events.on.bind(this.events);
    public once: EventListenerFunc<CoyoteLiveGameManagerEvents> = this.events.once.bind(this.events);
    public off: EventListenerFunc<CoyoteLiveGameManagerEvents> = this.events.off.bind(this.events);
    public removeAllListeners: EventRemoveAllFunc<CoyoteLiveGameManagerEvents> = this.events.removeAllListeners.bind(this.events);
}

CoyoteLiveGameManager.createInstance();