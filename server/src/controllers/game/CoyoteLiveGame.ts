import { EventEmitter } from 'events';

import { Channel } from '../../types/dg';
import { DGLabWSClient, StrengthInfo } from '../../controllers/ws/DGLabWS';
import { Task } from '../../utils/task';
import { randomInt, simpleObjDiff } from '../../utils/utils';
import { EventStore } from '../../utils/EventStore';
import { CoyoteLiveGameManager } from '../../managers/CoyoteLiveGameManager';
import { CoyoteLiveGameConfig, GameStrengthConfig } from '../../types/game';
import { DGLabPulseBaseInfo } from '../../services/DGLabPulse';

export type GameStrengthInfo = StrengthInfo & {
    tempStrength: number;
};

export interface CoyoteLiveGameEvents {
    close: [];
    pulseListUpdated: [pulseList: DGLabPulseBaseInfo[]];
    strengthChanged: [strength: GameStrengthInfo];
    configUpdated: [config: CoyoteLiveGameConfig];
    gameStarted: [];
    gameStopped: [];
}

export const FIRE_MAX_DURATION = 30000;

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

    public strengthConfigModified: number = 0;

    /** 一键开火强度 */
    public fireStrength: number = 0;

    /** 一键开火结束时间 */
    public fireEndTimestamp: number = 0;

    /** 一键开火波形 */
    public firePulseId: string = '';

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

    public get gameStrength(): GameStrengthInfo {
        return {
            ...this.client.strength,
            tempStrength: this.fireStrength,
        };
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
            this.strengthConfigModified = Date.now();
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
            if (strength.strength < this.strengthConfig.strength && Date.now() - this.strengthConfigModified > 500) {
                // 强度低于随机强度，且500ms内没有更新强度配置时降低随机强度
                this.strengthConfig.strength = strength.strength;
                configUpdated = true;
            }
            
            this.events.emit('strengthChanged', this.gameStrength);

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
    public async updateConfig(config: CoyoteLiveGameConfig): Promise<void> {
        let configUpdated = false;
        let onlyStrengthUpdated = false;
        let deltaStrength = 0;
        
        let diffKeys = simpleObjDiff(config.strength, this.strengthConfig);
        if (diffKeys) {
            this.strengthConfig = config.strength;
            this.strengthConfigModified = Date.now();
            configUpdated = true;

            onlyStrengthUpdated = diffKeys.every((key) => key === 'strength' || key === 'randomStrength');
            deltaStrength = this.strengthConfig.strength - this.client.strength.strength;

            // 如果游戏未开始，且强度小于最低强度，需要更新强度，否则本地强度会被服务端强制更新
            if (this.client.strength.strength < this.strengthConfig.strength && this.gameTask) {
                await this.client.setStrength(Channel.A, this.strengthConfig.strength);
            }
        }

        if (config.pulseId && config.pulseId !== this.currentPulseId) {
            this.currentPulseId = config.pulseId;
            configUpdated = true;
        }

        if (configUpdated) {
            this.handleConfigUpdated();

            if (onlyStrengthUpdated && deltaStrength <= 5) {
                // 如果只更新了强度，且强度增加不超过5，则直接设置强度
                // 在GameApi连续加减时，这么做可以防止波形大量中断
                await this.setClientStrength(this.strengthConfig.strength);
            } else {
                // 重启波形输出
                await this.restartGame();
            }
        }
    }

    /**
     * 一键开火
     * @param strength 强度
     * @param duration 持续时间（毫秒）
     * @param pulseId 一键开火使用的脉冲ID（可选）
     * @param override 是否覆盖当前一键开火时间，false则增加持续时间
     */
    public async fire(strength: number, duration: number, pulseId?: string, override?: boolean): Promise<void> {
        // 限制强度和持续时间
        if (strength > 30) {
            strength = 30;
        }
        if (duration > 30000) {
            duration = 30000;
        }
        
        if (!this.fireStrength) {
            this.fireStrength = strength;
            this.fireEndTimestamp = Date.now() + duration;
            this.firePulseId = pulseId || '';

            // 通知强度变化
            this.events.emit('strengthChanged', this.gameStrength);

            this.restartGame().catch((err: any) => {
                console.error('Failed to restart game:', err);
            }); // 一键开火时需要重启游戏Task
        } else {
            // 已经在一键开火状态，使用最大的强度，持续时间增加
            this.fireStrength = Math.max(this.fireStrength, strength);
            if (override) {
                this.fireEndTimestamp = Date.now() + duration;
            } else {
                this.fireEndTimestamp += duration;
                if (this.fireEndTimestamp > Date.now() + FIRE_MAX_DURATION) { // 最多持续30秒
                    this.fireEndTimestamp = Date.now() + FIRE_MAX_DURATION;
                }
            }
            this.firePulseId = pulseId || '';
        }
    }

    private onFireEnd() {
        this.fireStrength = 0;
        this.fireEndTimestamp = 0;

        // 通知强度变化
        this.events.emit('strengthChanged', this.gameStrength);
    }

    private handleConfigUpdated(): void {
        this.events.emit('configUpdated', this.gameConfig);
    }

    private async setClientStrength(strength: number): Promise<void> {
        if (!this.client.active) {
            return;
        }

        await this.client.setStrength(Channel.A, strength);
        if (this.strengthConfig.bChannelMultiplier) {
            let bStrength = Math.min(strength * this.strengthConfig.bChannelMultiplier, this.clientStrength.limit);
            await this.client.setStrength(Channel.B, bStrength);
        }
    }

    private async runGameTask(ab: AbortController, harvest: () => void): Promise<void> {
        let outputTime = 0;
        let pulseId = this.currentPulseId;
        if (this.fireStrength) {
            if (Date.now() > this.fireEndTimestamp) { // 一键开火结束
                this.fireStrength = 0;
                this.fireEndTimestamp = 0;
            } else {
                outputTime = Math.min(this.fireEndTimestamp - Date.now(), FIRE_MAX_DURATION); // 单次最多输出30秒
            }

            if (this.firePulseId) {
                pulseId = this.firePulseId;
            }
        } else { // 随机强度
            outputTime = randomInt(this.strengthConfig.minInterval, this.strengthConfig.maxInterval) * 1000;
        }

        // 输出脉冲，直到下次随机强度时间
        await this.client.outputPulse(pulseId, outputTime, {
            abortController: ab,
            bChannel: !!(this.strengthConfig && this.strengthConfig.bChannelMultiplier),
            onTimeEnd: () => {
                if (this.fireStrength && Date.now() > this.fireEndTimestamp) { // 一键开火结束
                    this.onFireEnd();
                    // 提前降低强度
                    this.setClientStrength(this.strengthConfig.strength).catch((error) => {
                        console.error('Failed to set strength:', error);
                    });
                }
            }
        });

        harvest();

        let nextStrength: number | null = null;
        if (!this.fireStrength && this.strengthConfig.randomStrength) { // 非一键开火状态，且有随机强度
            // 随机强度
            nextStrength = this.strengthConfig.strength + randomInt(0, this.strengthConfig.randomStrength);
            nextStrength = Math.min(nextStrength, this.clientStrength.limit);
        }

        if (nextStrength !== null) {
            setTimeout(async () => {
                if (Date.now() - this.strengthConfigModified > 51) { // 防止重复设置强度
                    try {
                        await this.setClientStrength(nextStrength);
                    } catch (error) {
                        console.error('Failed to set strength:', error);
                    }
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
            initStrength = Math.min(initStrength, this.clientStrength.limit); // 限制初始强度不超过限制

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
