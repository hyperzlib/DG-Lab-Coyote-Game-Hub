import fs from 'fs';
import path from 'path';

import { LRUCache } from "lru-cache";
import { ExEventEmitter } from "../utils/ExEventEmitter";
import { GameCustomPulseConfig, MainGameConfig } from '../types/game';
import { DGLabPulseService } from './DGLabPulse';

export enum GameConfigType {
    MainGame = 'main-game',
    CustomPulse = 'custom-pulse',
}

export interface CoyoteLiveGameManagerEvents {
    configUpdated: [type: GameConfigType | string, newConfig: any];
};

export type GameConfigTypeMap = {
    [GameConfigType.MainGame]: MainGameConfig,
    [GameConfigType.CustomPulse]: GameCustomPulseConfig,
};

export class CoyoteGameConfigService {
    private static _instance: CoyoteGameConfigService;

    private gameConfigDir = 'data/game-config';

    private events = new ExEventEmitter<CoyoteLiveGameManagerEvents>();
    private configCache: LRUCache<string, any> = new LRUCache({
        max: 1000,
        ttl: 1000 * 60 * 30, // 30 minutes
    });

    public static createInstance() {
        if (!this._instance) {
            this._instance = new CoyoteGameConfigService();
        }
    }

    public static get instance() {
        this.createInstance();
        return this._instance;
    }

    public async initialize() {
        if (!fs.existsSync(this.gameConfigDir)) {
            fs.mkdirSync(this.gameConfigDir, { recursive: true });
        }
    }

    public getDefaultConfig(type: GameConfigType) {
        if (type === GameConfigType.MainGame) {
            return {
                strengthChangeInterval: [15, 30],
                enableBChannel: false,
                bChannelStrengthMultiplier: 1,
                pulseId: DGLabPulseService.instance.getDefaultPulse().id,
                pulseMode: 'single',
                pulseChangeInterval: 60,
            };
        } else if (type === GameConfigType.CustomPulse) {
            return {
                customPulseList: [],
            };
        }
    }

    public async set<TKey extends keyof GameConfigTypeMap>(clientId: string, type: GameConfigType, newConfig: GameConfigTypeMap[TKey]) {
        const cacheKey = `${clientId}/${type}`;
        this.configCache.set(cacheKey, newConfig);

        await fs.promises.writeFile(path.join(this.gameConfigDir, `${clientId}.${type}.json`), JSON.stringify(newConfig, null, 4), { encoding: 'utf-8' });

        this.events.emitSub('configUpdated', cacheKey, type, newConfig);
        this.events.emitSub('configUpdated', clientId, type, newConfig);
    }

    public async get<TKey extends keyof GameConfigTypeMap>(clientId: string, type: TKey, useDefault?: true): Promise<GameConfigTypeMap[TKey]>
    public async get<TKey extends keyof GameConfigTypeMap>(clientId: string, type: TKey, useDefault: false): Promise<GameConfigTypeMap[TKey] | undefined>
    public async get<TKey extends keyof GameConfigTypeMap>(clientId: string, type: TKey, useDefault: boolean = true): Promise<GameConfigTypeMap[TKey] | undefined> {
        const cacheKey = `${clientId}/${type}`;
        if (this.configCache.has(cacheKey)) {
            return this.configCache.get(cacheKey);
        }

        const configPath = path.join(this.gameConfigDir, `${clientId}.${type}.json`);
        if (fs.existsSync(configPath)) {
            const fileContent = await fs.promises.readFile(configPath, { encoding: 'utf-8' });
            const config = JSON.parse(fileContent);
            this.configCache.set(cacheKey, config);
            return config;
        }

        if (useDefault) {
            const defaultConfig = this.getDefaultConfig(type);
            this.configCache.set(cacheKey, defaultConfig);
            return defaultConfig as any;
        }

        return undefined;
    }

    public async update<TKey extends keyof GameConfigTypeMap>(clientId: string, type: TKey, newConfig: Partial<GameConfigTypeMap[TKey]>) {
        const cacheKey = `${clientId}/${type}`;
        const config = await this.get(clientId, type, false);
        if (!config) {
            throw new Error(`Config not found: ${cacheKey}`);
        }

        const updatedConfig = {
            ...config,
            ...newConfig,
        };

        await this.set(clientId, type, updatedConfig);
    }

    public on = this.events.on.bind(this.events);
    public once = this.events.once.bind(this.events);
    public off = this.events.off.bind(this.events);
    public removeAllListeners = this.events.removeAllListeners.bind(this.events);
}