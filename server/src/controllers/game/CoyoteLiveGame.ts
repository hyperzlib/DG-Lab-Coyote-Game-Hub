import { EventEmitter } from 'events';

import { Channel } from '../../types/dg';
import { DGLabWSClient, StrengthInfo } from '../../controllers/ws/DGLabWS';
import { Task } from '../../utils/task';
import { randomInt, simpleObjEqual } from '../../utils/utils';
import { EventStore } from '../../utils/EventStore';
import { CoyoteLiveGameManager } from '../../managers/CoyoteLiveGameManager';
import { CoyoteLiveGameConfig, GameStrengthConfig } from '../../types/game';
import { DGLabPulseBaseInfo } from '../../services/DGLabPulse';
import { str } from 'ajv';

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

    /** 一键开火强度 */
    public fireStrength: number = 0;

    /** 一键开火结束时间 */
    public fireEndTimestamp: number = 0;

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

    /**
     * 一键开火
     * @param strength 强度
     * @param duration 持续时间（毫秒）
     */
    public async fire(strength: number, duration: number) {
        if (!this.fireStrength) {
            this.fireStrength = strength;
            this.fireEndTimestamp = Date.now() + duration;

            this.restartGame().catch((err: any) => {
                console.error('Failed to restart game:', err);
            }); // 一键开火时需要重启游戏Task
        } else {
            // 已经在一键开火状态，使用最大的强度，持续时间增加
            this.fireStrength = Math.max(this.fireStrength, strength);
            this.fireEndTimestamp += duration;
        }
    }

    private handleConfigUpdated(): void {
        this.events.emit('configUpdated', this.gameConfig);
    }

    private async runGameTask(ab: AbortController, harvest: () => void): Promise<void> {
        let outputTime = 0;
        if (this.fireStrength) {
            if (Date.now() > this.fireEndTimestamp) { // 一键开火结束
                this.fireStrength = 0;
                this.fireEndTimestamp = 0;
            } else {
                outputTime = Math.min(this.fireEndTimestamp - Date.now(), 30000); // 单次最多输出30秒
            }
        } else { // 随机强度
            outputTime = randomInt(this.strengthConfig.minInterval, this.strengthConfig.maxInterval) * 1000;
        }

        // 输出脉冲，直到下次随机强度时间
        await this.client.outputPulse(this.currentPulseId, outputTime, {
            abortController: ab,
            bChannel: !!(this.strengthConfig && this.strengthConfig.bChannelMultiplier),
        });

        harvest();

        let nextStrength: number | null = null;
        if (this.fireStrength) {
            if (Date.now() > this.fireEndTimestamp) { // 一键开火结束
                this.fireStrength = 0;
                this.fireEndTimestamp = 0;

                nextStrength = this.strengthConfig.strength; // 一键开火结束后恢复到初始强度
            }
        } else {
            if (this.strengthConfig.randomStrength) {
                // 随机强度
                nextStrength = this.strengthConfig.strength + randomInt(0, this.strengthConfig.randomStrength);
                nextStrength += randomInt(0, this.strengthConfig.randomStrength);
                nextStrength = Math.min(nextStrength, this.clientStrength.limit);
            }
        }

        if (nextStrength) {
            setTimeout(async () => {
                try {
                    await this.client.setStrength(Channel.A, nextStrength);
                    if (this.strengthConfig.bChannelMultiplier) {
                        await this.client.setStrength(Channel.B, nextStrength * this.strengthConfig.bChannelMultiplier);
                    }
                } catch (error) {
                    console.error('Failed to set strength:', error);
                }
            }, 50);
        }
    }

    /**
     * 开启游戏
     * @param ignoreEvent 
     */
    public async startGame(ignoreEvent = false): Promise<void> {
        if (!this.gameTask) {
            // 初始化强度和脉冲
            await this.client.reset();

            let initStrength = this.strengthConfig.strength;

            if (this.fireStrength) { // 一键开火时，增加初始强度
                initStrength += this.fireStrength;
            }

            // 设置初始强度
            await this.client.setStrength(Channel.A, initStrength);
            if (this.strengthConfig.bChannelMultiplier) {
                await this.client.setStrength(Channel.B, initStrength * this.strengthConfig.bChannelMultiplier);
            } else {
                await this.client.setStrength(Channel.B, 0);
            }

            // 启动游戏任务
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
