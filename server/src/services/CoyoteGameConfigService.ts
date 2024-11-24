import fs from 'fs';
import path from 'path';

import { LRUCache } from "lru-cache";
import { ExEventEmitter } from "../utils/ExEventEmitter";
import { GameCustomPulseConfig, MainGameConfig } from '../types/game';
import { DGLabPulseService } from './DGLabPulse';
import { CoyoteGamePlayConfig, CoyoteGamePlayUserConfig } from '../types/gamePlay';
import { MainGameConfigUpdater } from '../model/config/MainGameConfigUpdater';
import { CustomPulseConfigUpdater } from '../model/config/CustomPulseConfigUpdater';
import { GamePlayConfigUpdater } from '../model/config/GamePlayConfigUpdater';
import { GamePlayUserConfigUpdater } from '../model/config/GamePlayUserConfigUpdater';
import { ObjectUpdater } from '../utils/ObjectUpdater';

export enum GameConfigType {
    MainGame = 'main-game',
    CustomPulse = 'custom-pulse',
    GamePlay = 'game-play',
    GamePlayUserConfig = 'game-play-config',
}

export interface CoyoteLiveGameManagerEvents {
    configUpdated: [type: GameConfigType | string, newConfig: any];
};

export type GameConfigTypeMap = {
    [GameConfigType.MainGame]: MainGameConfig,
    [GameConfigType.CustomPulse]: GameCustomPulseConfig,
    [GameConfigType.GamePlay]: CoyoteGamePlayConfig,
    [GameConfigType.GamePlayUserConfig]: CoyoteGamePlayUserConfig,
};

export class CoyoteGameConfigService {
    private static _instance: CoyoteGameConfigService;

    private gameConfigDir = 'data/game-config';

    public events = new ExEventEmitter<CoyoteLiveGameManagerEvents>();

    public configUpdaters: Record<string, ObjectUpdater> = {
        [GameConfigType.MainGame]: new MainGameConfigUpdater(),
        [GameConfigType.CustomPulse]: new CustomPulseConfigUpdater(),
        [GameConfigType.GamePlay]: new GamePlayConfigUpdater(),
        [GameConfigType.GamePlayUserConfig]: new GamePlayUserConfigUpdater(),
    };
    
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

    public getDefaultConfig(type: GameConfigType | string) {
        return this.configUpdaters[type]?.getDefaultEmptyObject();
    }

    public async set<TKey extends keyof GameConfigTypeMap>(clientId: string, type: GameConfigType, newConfig: GameConfigTypeMap[TKey]) {
        const configUpdater = this.configUpdaters[type];
        if (!configUpdater) {
            throw new Error(`Config type not found: ${type}`);
        }
        
        const cacheKey = `${clientId}/${type}`;
        this.configCache.set(cacheKey, newConfig);

        let storeConfig = {
            ...newConfig,
            version: configUpdater.getCurrentVersion(),
        };

        await fs.promises.writeFile(path.join(this.gameConfigDir, `${clientId}.${type}.json`), JSON.stringify(storeConfig, null, 4), { encoding: 'utf-8' });

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

        const configUpdater = this.configUpdaters[type];
        if (!configUpdater) {
            throw new Error(`Config type not found: ${type}`);
        }

        const configPath = path.join(this.gameConfigDir, `${clientId}.${type}.json`);
        if (fs.existsSync(configPath)) {
            const fileContent = await fs.promises.readFile(configPath, { encoding: 'utf-8' });
            const config = JSON.parse(fileContent);

            let updatedConfig = config;
            // 在获取配置时，如果版本不一致，则更新配置schema
            if (config.version !== configUpdater.getCurrentVersion()) {
                updatedConfig = configUpdater.updateObject(config);
                await fs.promises.writeFile(configPath, JSON.stringify(updatedConfig, null, 4), { encoding: 'utf-8' });
            }

            this.configCache.set(cacheKey, updatedConfig);
            return updatedConfig;
        }

        if (useDefault) {
            const defaultConfig = configUpdater.getDefaultEmptyObject();
            this.configCache.set(cacheKey, defaultConfig);
            return defaultConfig;
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

    public async delete(clientId: string, type: GameConfigType) {
        const cacheKey = `${clientId}/${type}`;
        this.configCache.delete(cacheKey);

        const configPath = path.join(this.gameConfigDir, `${clientId}.${type}.json`);
        if (fs.existsSync(configPath)) {
            await fs.promises.unlink(configPath);
        }

        this.events.emitSub('configUpdated', clientId, type, null);
    }

    /**
     * Copy all configs from one client to another
     * @param fromClientId 
     * @param toClientId 
     */
    public async copyAllConfigs(fromClientId: string, toClientId: string) {
        for (const type of Object.keys(this.configUpdaters)) {
            const config = await this.get(fromClientId, type as keyof GameConfigTypeMap, false);
            if (config) {
                await this.set(toClientId, type as keyof GameConfigTypeMap, config);
            }
        }
    }

    public on = this.events.on.bind(this.events);
    public once = this.events.once.bind(this.events);
    public off = this.events.off.bind(this.events);
    public removeAllListeners = this.events.removeAllListeners.bind(this.events);
}