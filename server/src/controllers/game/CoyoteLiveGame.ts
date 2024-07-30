import { EventEmitter } from 'events';

import { Channel } from '../../types/dg';
import { DGLabWSClient, StrengthInfo } from '../../controllers/ws/DGLabWS';
import { Task } from '../../utils/task';
import { randomInt, simpleObjEqual } from '../../utils/utils';
import { EventStore } from '../../utils/EventStore';
import { CoyoteLiveGameManager } from '../../managers/CoyoteLiveGameManager';
import { CoyoteLiveGameConfig, GameStrengthConfig } from '../../types/game';
import { DGLabPulseBaseInfo } from '../../services/DGLabPulse';

export interface CoyoteLiveGameEvents {
    close: [];
    pulseListUpdated: [pulseList: DGLabPulseBaseInfo[]];
    strengthChanged: [strength: StrengthInfo];
    configUpdated: [config: CoyoteLiveGameConfig];
    gameStarted: [];
    gameStopped: [];
}

export class CoyoteLiveGame {
    public clientType = 'dglab';

    public client: DGLabWSClient;

    public strengthConfig: GameStrengthConfig = {
        strength: 0,
        randomStrength: 0,
        minInterval: 10,
        maxInterval: 20,
        bChannelMultiplier: 0,
    };

    public currentPulseId: string = '';

    private eventStore: EventStore = new EventStore();
    private events = new EventEmitter<CoyoteLiveGameEvents>();

    private gameTask: Task | null = null;

    public get gameConfig(): CoyoteLiveGameConfig {
        return {
            strength: this.strengthConfig,
            pulseId: this.currentPulseId,
        };
    }

    public get clientId(): string {
        return this.client.clientId;
    }

    public get clientStrength(): StrengthInfo {
        return this.client.strength;
    }

    constructor(client: DGLabWSClient) {
        this.client = client;
        
        if (this.client.pulseList.length > 0) { // 默认使用第一个脉冲
            console.log('Selecting default pulse:', this.client.pulseList[0].id);
            this.currentPulseId = this.client.pulseList[0].id;
        }
    }

    async initialize(): Promise<void> {
        // 从缓存中恢复游戏状态
        const configCachePrefix = `coyoteLiveGameConfig:${this.client.clientId}:`;
        const configCache  = CoyoteLiveGameManager.instance.configCache;
        let hasCachedConfig = false;

        let cachedGameStrengthConfig = configCache.get(`${configCachePrefix}:strength`);
        if (cachedGameStrengthConfig) {
            this.strengthConfig = cachedGameStrengthConfig;
            hasCachedConfig = true;
        }

        let cachedPulseId = configCache.get(`${configCachePrefix}:pulseId`);
        if (cachedPulseId) {
            this.currentPulseId = cachedPulseId;
            hasCachedConfig = true;
        }

        if (hasCachedConfig) { // 有缓存配置时需要通知客户端
            this.handleConfigUpdated();
        }

        // 在断线时结束游戏
        const clientEvents = this.eventStore.wrap(this.client);
        clientEvents.on('close', () => {
            this.destroy().catch((error) => {
                console.error('Failed to destroy CoyoteLiveGame:', error);
            });
        });

        // 监听波形列表更新事件
        clientEvents.on('pulseListUpdated', (pulseList) => {
            this.events.emit('pulseListUpdated', pulseList);

            if (!this.currentPulseId && pulseList.length > 0) {
                this.handleConfigUpdated();
            }
        });

        // 监听强度上报事件
        clientEvents.on('strengthChanged', (strength, _) => {
            let configUpdated = false;
            if (strength.strength < this.strengthConfig.strength) { // 强度低于随机强度时降低随机强度
                this.strengthConfig.strength = strength.strength;
                configUpdated = true;
            }
            
            this.events.emit('strengthChanged', strength);

            if (configUpdated) {
                this.handleConfigUpdated();
            }
        });
    }

    public get enabled() {
        return this.gameTask?.running ?? false;
    }

    /**
     * 更新游戏配置
     * @param config 
     */
    public updateConfig(config: CoyoteLiveGameConfig): void {
        let configUpdated = false;
        
        if (!simpleObjEqual(config.strength, this.strengthConfig)) {
            this.strengthConfig = config.strength;
            configUpdated = true;

            // 如果游戏未开始，且强度小于最低强度，需要更新强度，否则本地强度会被服务端强制更新
            if (this.client.strength.strength < this.strengthConfig.strength && this.gameTask) {
                this.client.setStrength(Channel.A, this.strengthConfig.strength).catch((error) => {
                    console.error('Failed to set strength:', error);
                });
            }
        }

        if (config.pulseId && config.pulseId !== this.currentPulseId) {
            this.currentPulseId = config.pulseId;
            configUpdated = true;
        }

        if (configUpdated) {
            this.handleConfigUpdated();

            this.restartGame().catch((error) => {
                console.error('Failed to restart CoyoteLiveGame:', error);
            });
        }
    }

    private handleConfigUpdated(): void {
        this.events.emit('configUpdated', this.gameConfig);
    }

    private async runGameTask(ab: AbortController, harvest: () => void): Promise<void> {
        let nextRandomStrengthTime = randomInt(this.strengthConfig.minInterval, this.strengthConfig.maxInterval) * 1000;

        // 输出脉冲，直到下次随机强度时间
        await this.client.outputPulse(this.currentPulseId, nextRandomStrengthTime, {
            abortController: ab,
            bChannel: !!(this.strengthConfig && this.strengthConfig.bChannelMultiplier),
        });

        harvest();

        let strength = this.strengthConfig.strength;
        if (this.strengthConfig.randomStrength) {
            // 随机强度
            strength += randomInt(0, this.strengthConfig.randomStrength);
            strength = Math.min(strength, this.clientStrength.limit);
        }

        setTimeout(async () => {
            try {
                await this.client.setStrength(Channel.A, strength);
                if (this.strengthConfig.bChannelMultiplier) {
                    await this.client.setStrength(Channel.B, strength * this.strengthConfig.bChannelMultiplier);
                }
            } catch (error) {
                console.error('Failed to set strength:', error);
            }
        }, 50);
    }

    /**
     * 开启游戏
     * @param ignoreEvent 
     */
    public async startGame(ignoreEvent = false): Promise<void> {
        if (!this.gameTask) {
            // 初始化强度和脉冲
            await this.client.reset();

            const initStrength = this.strengthConfig.strength;
            await this.client.setStrength(Channel.A, initStrength);
            if (this.strengthConfig.bChannelMultiplier) {
                await this.client.setStrength(Channel.B, initStrength * this.strengthConfig.bChannelMultiplier);
            } else {
                await this.client.setStrength(Channel.B, 0);
            }

            this.gameTask = new Task((ab, harvest) => this.runGameTask(ab, harvest));
            this.gameTask.on('error', (error) => {
                console.error('Game task error:', error);
            });

            if (!ignoreEvent) {
                this.events.emit('gameStarted');
            }
        }
    }

    /**
     * 停止或暂停游戏
     * @param ignoreEvent 
     */
    public async stopGame(ignoreEvent = false): Promise<void> {
        if (this.gameTask) {
            await this.gameTask.abort();
            this.gameTask = null;

            await this.client.reset();

            if (!ignoreEvent) {
                this.events.emit('gameStopped');
            }
        }
    }

    /**
     * 重启游戏
     * 
     * 每次更新配置后都需要重启游戏
     */
    public async restartGame(): Promise<void> {
        if (this.gameTask) {
            await this.stopGame(true);
            await this.startGame(true);
        }
    }

    public async destroy(): Promise<void> {
        // console.log('Destroying CoyoteLiveGame');

        if (this.gameTask) {
            await this.gameTask.stop();
        }

        // 保存配置, 以便下次连接时恢复
        const configCachePrefix = `coyoteLiveGameConfig:${this.client.clientId}:`;
        const configCache  = CoyoteLiveGameManager.instance.configCache;
        configCache.set(`${configCachePrefix}:strength`, this.strengthConfig);
        configCache.set(`${configCachePrefix}:pulseId`, this.currentPulseId);

        this.events.emit('close');
    }

    public on = this.events.on.bind(this.events);
    public once = this.events.once.bind(this.events);
    public off = this.events.off.bind(this.events);
    public removeAllListeners = this.events.removeAllListeners.bind(this.events);
}
