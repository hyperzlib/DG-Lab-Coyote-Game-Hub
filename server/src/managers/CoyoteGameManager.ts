import { CoyoteGameController } from "../controllers/game/CoyoteGameController";
import { DGLabWSClient } from "../controllers/ws/DGLabWS";
import { DGLabWSManager } from "./DGLabWSManager";
import { LRUCache } from "lru-cache";
import { ExEventEmitter } from "../utils/ExEventEmitter";
import { MultipleLinkedMap } from "../utils/MultipleLinkedMap";

export interface CoyoteGameManagerEvents {
    
}

export class CoyoteGameManager {
    private static _instance: CoyoteGameManager;

    private games: Map<string, CoyoteGameController>;
    private gameIdentifiers: MultipleLinkedMap<string, string> = new MultipleLinkedMap();

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
            this.gameIdentifiers.removeField(clientId);
        });

        game.on('identifiersUpdated', (newIdentifiers) => {
            this.gameIdentifiers.setFieldValues(clientId, newIdentifiers);
        });

        this.games.set(clientId, game);

        return game;
    }

    public getGame(id: string, identifyType: 'id' | 'readonly' | 'gameplay' = 'id') {
        if (identifyType === 'id') {
            return this.games.get(id);
        }

        // 根据不同的标识类型查找游戏ID
        const gameId = this.gameIdentifiers.getFieldKey(`${identifyType}:${id}`);
        if (!gameId) {
            return undefined;
        }

        return this.games.get(gameId);
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