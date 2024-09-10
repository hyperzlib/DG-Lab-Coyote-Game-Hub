import { EventEmitter } from 'events';

import { Channel } from '../../types/dg';
import { DGLabWSClient, StrengthInfo } from '../../controllers/ws/DGLabWS';
import { Task } from '../../utils/task';
import { asleep, randomInt, simpleObjDiff } from '../../utils/utils';
import { EventStore } from '../../utils/EventStore';
import { CoyoteLiveGameManager } from '../../managers/CoyoteLiveGameManager';
import { MainGameConfig, GameStrengthConfig } from '../../types/game';
import { CoyoteGameConfigService, GameConfigType } from '../../services/CoyoteGameConfigService';
import { PulsePlayList } from '../../utils/PulsePlayList';
import { AbstractGameAction } from './actions/AbstractGameAction';

export type GameStrengthInfo = StrengthInfo & {
    tempStrength: number;
};

export interface CoyoteLiveGameEvents {
    close: [];
    strengthChanged: [strength: GameStrengthInfo];
    strengthConfigUpdated: [config: GameStrengthConfig];
    gameStarted: [];
    gameStopped: [];
}

export const FIRE_MAX_DURATION = 30000;

export class CoyoteLiveGame {
    public clientType = 'dglab';

    public client: DGLabWSClient;

    public strengthConfig: GameStrengthConfig = {
        strength: 5,
        randomStrength: 5,
    };

    public gameConfigService = CoyoteGameConfigService.instance;

    public gameConfig!: MainGameConfig;

    public strengthConfigModified: number = 0;

    public strengthSetTime: number = 0;

    public pulseOffsetTime: number = 0;

    public actionList: AbstractGameAction[] = [];

    private _tempStrength: number = 0;

    /** 波形播放列表 */
    public pulsePlayList!: PulsePlayList;

    private eventStore: EventStore = new EventStore();
    private events = new EventEmitter<CoyoteLiveGameEvents>();

    private gameTask: Task | null = null;

    public get tempStrength(): number {
        return this._tempStrength;
    }

    public set tempStrength(value: number) {
        this._tempStrength = value;
        this.events.emit('strengthChanged', this.gameStrength);
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
            tempStrength: this._tempStrength,
        };
    }

    constructor(client: DGLabWSClient) {
        this.client = client;
    }

    async initialize(): Promise<void> {
        this.gameConfig = await CoyoteGameConfigService.instance.get(this.client.clientId, GameConfigType.MainGame, true);

        // 初始化波形列表
        let pulseList = typeof this.gameConfig.pulseId === 'string' ? [this.gameConfig.pulseId] : this.gameConfig.pulseId;
        this.pulsePlayList = new PulsePlayList(pulseList, this.gameConfig.pulseMode, this.gameConfig.pulseChangeInterval);

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

        if (hasCachedConfig) { // 有缓存配置时需要通知客户端
            this.events.emit('strengthConfigUpdated', this.strengthConfig);
        }

        // 监听配置更新事件
        const configEvents = this.eventStore.wrap(this.gameConfigService);
        configEvents.on('configUpdated', `${this.clientId}/${GameConfigType.MainGame}`, (type, newConfig) => {
            this.handleConfigUpdated(newConfig);
        });

        // 在断线时结束游戏
        const clientEvents = this.eventStore.wrap(this.client);
        clientEvents.on('close', () => {
            this.destroy().catch((error) => {
                console.error('Failed to destroy CoyoteLiveGame:', error);
            });
        });

        // 监听强度上报事件
        clientEvents.on('strengthChanged', (strength, _) => {
            let configUpdated = false;
            if (strength.strength < this.strengthConfig.strength && Date.now() - this.strengthConfigModified > 500) {
                // 强度低于基础强度，且500ms内没有更新强度配置时降低随机强度
                this.strengthConfig.strength = strength.strength;
                configUpdated = true;
            }

            // 估算脉冲的offset时间
            this.pulseOffsetTime = Date.now() - this.strengthSetTime - 50;
            
            this.events.emit('strengthChanged', this.gameStrength);

            if (configUpdated) {
                this.events.emit('strengthConfigUpdated', this.strengthConfig);
            }
        });
    }

    public get enabled() {
        return this.gameTask?.running ?? false;
    }

    /**
     * 更新游戏强度配置
     * @param config 
     */
    public async updateStrengthConfig(config: GameStrengthConfig): Promise<void> {
        let deltaStrength = 0;
        
        if (simpleObjDiff(config.strength, this.strengthConfig)) {
            this.strengthConfig = config;
            this.strengthConfigModified = Date.now();

            deltaStrength = this.strengthConfig.strength - this.client.strength.strength;

            // 如果游戏未开始，且强度小于最低强度，需要更新强度，否则本地强度会被服务端强制更新
            if (this.client.strength.strength < this.strengthConfig.strength && this.gameTask) {
                await this.setClientStrength(this.strengthConfig.strength, true);
            }

            this.events.emit('strengthConfigUpdated', this.strengthConfig);

            if (deltaStrength <= 5) {
                // 如果强度增加不超过5，则直接设置强度
                // 在GameApi连续加减时，这么做可以防止波形大量中断
                await this.setClientStrength(this.strengthConfig.strength);
            } else {
                // 重启波形输出
                await this.restartGame();
            }
        }
    }

    /**
     * 开始一个游戏动作
     * @param action 
     */
    public async startAction(action: AbstractGameAction): Promise<void> {
        let existsIndex = this.actionList.findIndex((a) => a.constructor === action.constructor);
        if (existsIndex >= 0) {
            const oldAction = this.actionList[existsIndex];
            oldAction.updateConfig(action.config);
            oldAction.priority = action.priority;
        } else {
            this.actionList.push(action);
        }

        // 按优先级从大到小排序
        this.actionList.sort((a, b) => b.priority - a.priority);

        existsIndex = this.actionList.findIndex((a) => a.constructor === action.constructor);
        if (existsIndex === 0) { // 立刻执行新的动作
            // 重启波形输出
            await this.restartGame();
        }
    }

    /**
     * 强制结束一个游戏动作
     * @param action 
     */
    public async stopAction(action: AbstractGameAction): Promise<void> {
        let existsIndex = this.actionList.findIndex((a) => a.constructor === action.constructor);
        if (existsIndex >= 0) {
            this.actionList.splice(existsIndex, 1);

            if (existsIndex === 0) { // 移除的是当前执行的动作
                // 重启波形输出
                await this.restartGame();
            }
        }
    }

    /**
     * 游戏配置更新处理
     * @param newGameConfig 
     * @returns 
     */
    private handleConfigUpdated(newGameConfig: MainGameConfig): void {
        let diffKeys = simpleObjDiff(newGameConfig, this.gameConfig) as false | [keyof MainGameConfig];

        this.gameConfig = newGameConfig;

        if (!diffKeys) return;

        let shouldRestartGame = false;
        let shouldRestartGameKeys = ['pulseId', 'pulseMode', 'pulseChangeInterval', 'strengthChangeInterval', 'enableBChannel', 'bChannelStrengthMultiplier'];
        for (let key of diffKeys) {
            if (shouldRestartGameKeys.includes(key)) {
                shouldRestartGame = true;
                break;
            }
        }

        if (diffKeys.includes('pulseId') || diffKeys.includes('pulseMode') || diffKeys.includes('pulseChangeInterval')) {
            // 更新波形播放列表
            let pulseList = typeof this.gameConfig.pulseId === 'string' ? [this.gameConfig.pulseId] : this.gameConfig.pulseId;
            this.pulsePlayList = new PulsePlayList(pulseList, this.gameConfig.pulseMode, this.gameConfig.pulseChangeInterval);
        }

        if (shouldRestartGame) {
            this.restartGame().catch((error) => {
                console.error('Failed to restart game:', error);
            });
        }
    }

    /**
     * 设置客户端强度
     * @param strength 强度
     * @param immediate 是否立即设置，否则会计算脉冲offset
     * @returns 
     */
    public async setClientStrength(strength: number, immediate: boolean = false): Promise<void> {
        if (!this.client.active) {
            return;
        }

        if (!immediate) {
            await asleep(this.pulseOffsetTime);
        }

        await this.client.setStrength(Channel.A, strength);
        if (this.gameConfig.enableBChannel) {
            let bStrength = Math.min(strength * this.gameConfig.bChannelStrengthMultiplier, this.clientStrength.limit);
            await this.client.setStrength(Channel.B, bStrength);
        }

        this.strengthSetTime = Date.now();
    }

    /**
     * 运行输出任务
     * @param ab 
     * @param harvest 
     * @returns 
     */
    private async runGameTask(ab: AbortController, harvest: () => void, round: number): Promise<void> {
        if (this.actionList.length > 0) {
            // 执行游戏特殊动作
            const currentAction = this.actionList[0];
            await currentAction.execute(ab, harvest, () => {
                this.actionList.shift();
            });
            return;
        }

        // 执行默认的输出任务
        // 获取脉冲播放列表中的当前脉冲
        let pulseId = this.pulsePlayList.getCurrentPulseId();

        // 随机强度
        const strengthChangeInterval = this.gameConfig.strengthChangeInterval;
        let outputTime = randomInt(strengthChangeInterval[0], strengthChangeInterval[1]) * 1000;
        let nextStrength = this.strengthConfig.strength + randomInt(0, this.strengthConfig.randomStrength);
        nextStrength = Math.min(nextStrength, this.clientStrength.limit);

        if (Date.now() - this.strengthConfigModified > 51) { // 防止重复设置强度
            try {
                let isImmediate = round === 0;
                await this.setClientStrength(nextStrength, isImmediate);
            } catch (error) {
                console.error('Failed to set strength:', error);
            }
        }

        harvest();

        // 输出脉冲，直到下次随机强度时间
        await this.client.outputPulse(pulseId, outputTime, {
            abortController: ab,
            bChannel: this.gameConfig.enableBChannel,
        });
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
            initStrength = Math.min(initStrength, this.clientStrength.limit); // 限制初始强度不超过限制

            // 设置初始强度
            await this.setClientStrength(initStrength, true);

            // 启动游戏任务
            this.gameTask = new Task((ab, harvest, round) => this.runGameTask(ab, harvest, round));
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

        this.events.emit('close');

        this.eventStore.removeAllListeners();
        this.events.removeAllListeners();
    }

    public on = this.events.on.bind(this.events);
    public once = this.events.once.bind(this.events);
    public off = this.events.off.bind(this.events);
    public removeAllListeners = this.events.removeAllListeners.bind(this.events);
}
