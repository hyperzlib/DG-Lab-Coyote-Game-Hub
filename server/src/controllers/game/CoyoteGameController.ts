import { EventEmitter } from 'events';

import { Channel } from '#app/types/dg.js';
import type { DGLabWSClient, StrengthInfo } from '../ws/DGLabWS.js';
import { Task } from '#app/utils/task.js';
import { asleep, debounce, randomInt, simpleObjDiff, throttle } from '#app/utils/utils.js';
import { EventStore } from '#app/utils/eventStore.js';
import { CoyoteGameManager } from '#app/managers/CoyoteGameManager.js';
import type { MainGameConfig, GameStrengthConfig } from '#app/types/game.js';
import { PulsePlayList } from '#app/utils/pulsePlayList.js';
import type { AbstractGameAction } from './actions/AbstractGameAction.js';
import type { WebWSClient } from '../ws/WebWS.js';
import type { DGLabPulseInfo } from '#app/services/DGLabPulse.js';
import { LatencyLogger } from '#app/utils/latencyLogger.js';
import type { ServerContext } from '#app/types/server.js';
import { GameModel } from '#app/models/GameModel.js';
import { CustomPulseModel } from '#app/models/CustomPulseModel.js';
import { ExpiringMap } from '#app/utils/expiringMap.js';
import { GamePlayController } from './GamePlayController.js';

export type GameStrengthInfo = StrengthInfo & {
    tempStrength: number;
};

export interface CoyoteGameEvents {
    close: [];
    strengthChanged: [strength: GameStrengthInfo];
    strengthConfigUpdated: [config: GameStrengthConfig];
    clientConnected: [];
    clientDisconnected: [];
    gameStarted: [];
    gameStopped: [];
    logError: [error: Error, message?: string];
}

export class CoyoteGameController {
    private ctx: ServerContext;

    public events = new EventEmitter<CoyoteGameEvents>();

    private eventStore: EventStore = new EventStore();

    /** 在线Socket的ID列表，用于判断是否可以释放Game */
    private onlineSockets = new Set<string>();

    /** 延迟调试 */
    private latencyLogger = new LatencyLogger();

    /** 游戏对应的clientId */
    public clientId: string;

    /** DG-Lab客户端连接 */
    public client?: DGLabWSClient;

    /** 插件列表 */
    public gamePlayControllers: ExpiringMap<string, GamePlayController> = new ExpiringMap({
        ttl: 1000 * 60 * 30,
        refreshOnGet: true,
        refreshOnHas: false,
    });

    /** 强度配置 */
    public globalStrengthConfig: GameStrengthConfig = {
        strength: 5,
        randomStrength: 5,
    };

    /** 插件强度配置 */
    public scopedStrengthConfig: Record<string, GameStrengthConfig> = {};

    /** 
     * 游戏配置
     * 游戏配置是只有用户可以修改的配置，插件无法修改
     */
    public gameConfig!: MainGameConfig;

    /** 强度配置更改时间 */
    public strengthConfigModified: number = 0;

    /** 客户端强度设置时间 */
    public clientStrengthSetTime: number = 0;

    /** 当前游戏的特殊操作列表 */
    public actionList: AbstractGameAction[] = [];

    /** 自定义波形列表 */
    public customPulseList: DGLabPulseInfo[] = [];

    /** 波形播放列表 */
    public pulsePlayList!: PulsePlayList;

    /** 游戏主循环Task */
    private gameTask: Task | null = null;

    /** 临时强度（一键开火等事件的强度） */
    private _tempStrength: number = 0;

    /** 临时强度（一键开火等事件的强度） */
    public get tempStrength(): number {
        return this._tempStrength;
    }

    public set tempStrength(value: number) {
        this._tempStrength = value;
        this.events.emit('strengthChanged', this.gameStrength);
    }

    /** 当前客户端上报的强度信息 */
    public get clientStrength(): StrengthInfo {
        return this.client?.strength ?? {
            strength: 0,
            limit: 20,
        };
    }

    /** 当前游戏的强度信息，包含客户端上报的强度和临时强度 */
    public get gameStrength(): GameStrengthInfo {
        return {
            ...this.clientStrength,
            tempStrength: this._tempStrength,
        };
    }

    /** 绝对强度配置，包含全局强度配置和插件强度配置的叠加（计算属性，避免频繁调用） */
    public get absoluteStrengthConfig(): GameStrengthConfig {
        let strengthConfig: GameStrengthConfig = {
            ...this.globalStrengthConfig,
        };

        for (const gamePlayStrength of Object.values(this.scopedStrengthConfig)) {
            strengthConfig.strength += Math.max(0, gamePlayStrength.strength);
            strengthConfig.randomStrength += Math.max(0, gamePlayStrength.randomStrength);
        }

        return strengthConfig;
    }

    constructor(ctx: ServerContext, clientId: string) {
        this.ctx = ctx;
        this.clientId = clientId;
    }

    async initialize(): Promise<void> {
        this.gameConfig = await GameModel.getOrCreateByGameId(this.ctx.database, this.clientId);
        this.customPulseList = await CustomPulseModel.getPulseListByGameId(this.ctx.database, this.clientId) ?? [];

        // 初始化波形列表
        let pulseList = typeof this.gameConfig.pulseId === 'string' ? [this.gameConfig.pulseId] : this.gameConfig.pulseId;
        this.pulsePlayList = new PulsePlayList(pulseList, this.gameConfig.pulseMode, this.gameConfig.pulseChangeInterval);

        // 从缓存中恢复游戏状态
        const configCachePrefix = `coyoteLiveGameConfig:${this.clientId}:`;
        const configCache  = CoyoteGameManager.instance.configCache;
        let hasCachedConfig = false;

        let cachedGameStrengthConfig = configCache.get(`${configCachePrefix}:strength`);
        if (cachedGameStrengthConfig) {
            this.globalStrengthConfig = cachedGameStrengthConfig;
            this.strengthConfigModified = Date.now();
            hasCachedConfig = true;
        }

        if (hasCachedConfig) { // 有缓存配置时需要通知控制器更新配置
            this.events.emit('strengthConfigUpdated', this.globalStrengthConfig);
        }

        // 监听游戏配置更新事件
        const gameConfigEvents = this.eventStore.wrap(GameModel.events);
        gameConfigEvents.on('configUpdated', this.clientId, throttle((newConfig) => {
            this.handleConfigUpdated(newConfig);
        }, 100));

        const pulseEvents = this.eventStore.wrap(CustomPulseModel.events);
        pulseEvents.on('pulseListUpdated', this.clientId, throttle(async () => {
            // 重新加载自定义波形列表
            this.customPulseList = await CustomPulseModel.getPulseListByGameId(this.ctx.database, this.clientId);
        }, 100));
    }

    public get running() {
        return this.gameTask?.running ?? false;
    }

    public async bindClient(client: DGLabWSClient): Promise<void> {
        this.client = client;
        this.onlineSockets.add('dgclient');

        this.events.emit('clientConnected');
        this.events.emit('gameStopped');

        await this.setClientStrength(0);
        // 必须清空临时强度
        this._tempStrength = 0;

        // 通知客户端当前强度
        this.events.emit('strengthChanged', {
            limit: this.clientStrength.limit,
            strength: 0,
            tempStrength: 0,
        });

        const clientEvents = this.eventStore.wrap(this.client);
        // 连接关闭事件
        clientEvents.on('close', () => {
            clientEvents.removeAllListeners(); // 将会同时清除EventStore中的引用
            this.onlineSockets.delete('dgclient');
            this.handleSocketDisconnected();

            this.client = undefined;

            this.events.emit('clientDisconnected');
        });

        // 监听强度上报事件
        clientEvents.on('strengthChanged', (strength, _) => {
            this.events.emit('strengthChanged', this.gameStrength);
        });
    }

    public async bindControllerSocket(socket: WebWSClient): Promise<void> {
        this.onlineSockets.add(socket.socketId);

        const socketEvents = this.eventStore.wrap(socket);

        // 连接关闭事件
        socketEvents.on('close', () => {
            socketEvents.removeAllListeners(); // 将会同时清除EventStore中的引用
            this.onlineSockets.delete(socket.socketId);
            this.handleSocketDisconnected();
        });
    }

    /**
     * 更新游戏强度配置
     * @param config 
     */
    public async updateStrengthConfig(config: GameStrengthConfig): Promise<void> {
        this.events.emit('strengthConfigUpdated', this.globalStrengthConfig);

        if (simpleObjDiff(config, this.globalStrengthConfig)) {
            this.globalStrengthConfig = config;
            this.handleStrengthChanged();
        }
    }

    /**
     * 处理强度配置更新后的强度变更
     * 在修改globalStrengthConfig或scopedStrengthConfig后需要调用此方法来处理强度变更
     * @todo 完成每个GamePlay拥有单独的强度配置后的强度变更处理逻辑
     * @param strengthConfig
     */
    private async handleStrengthConfigChangedInternal(): Promise<void> {
        this.strengthConfigModified = Date.now();
        let deltaStrength = 0;

        if (this.client) { // 客户端已连接时才更新强度
            const absoluteStrengthConfig = this.absoluteStrengthConfig;
            deltaStrength = absoluteStrengthConfig.strength - this.client.strength.strength;

            if (deltaStrength <= 5) {
                // 如果强度增加不超过5，则直接设置强度
                // 在GameApi连续加减时，这么做可以防止波形大量中断
                await this.setClientStrength(absoluteStrengthConfig.strength);
            } else {
                // 重启波形输出
                await this.restartGame();
            }
        }
    }

    public handleStrengthChanged = throttle(() => {
        this.handleStrengthConfigChangedInternal().catch((error) => {
            console.error('Failed to handle strength changed:', error);
            this.events.emit('logError', error, 'Failed to handle strength changed');
        });
    }, 100);

    /**
     * 开始一个游戏动作
     * @param action 
     */
    public async startAction(action: AbstractGameAction): Promise<void> {
        this.latencyLogger.start('action ' + action.constructor.name);

        let existsIndex = this.actionList.findIndex((a) => a.constructor === action.constructor);
        if (existsIndex >= 0) {
            const oldAction = this.actionList[existsIndex];
            oldAction.updateConfig(action.config);
            oldAction.priority = action.priority;
        } else {
            action._initialize(this);
            this.actionList.push(action);
        }

        // 按优先级从大到小排序
        this.actionList.sort((a, b) => b.priority - a.priority);

        existsIndex = this.actionList.findIndex((a) => a.constructor === action.constructor);
        if (existsIndex === 0) { // 立刻执行新的动作
            // 重启波形输出
            this.latencyLogger.log('startAction');
            await this.restartGameTask();
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
     * @returns 
     */
    public async setClientStrength(strength: number): Promise<void> {
        if (!this.client?.active) {
            return;
        }

        await this.client.setStrength(Channel.A, strength);
        if (this.gameConfig.enableBChannel) {
            let bStrength = Math.min(strength * this.gameConfig.bChannelStrengthMultiplier, this.clientStrength.limit);
            await this.client.setStrength(Channel.B, bStrength);
        }

        this.clientStrengthSetTime = Date.now();
    }

    /**
     * 运行输出任务
     * @param ab 
     * @param harvest 
     * @returns 
     */
    private async runGameTask(ab: AbortController, harvest: () => void, round: number): Promise<void> {
        if (!this.client) {
            this.stopGame().catch((error) => {
                console.error('Failed to stop game:', error);
            });
            return;
        }

        if (this.actionList.length > 0) {
            // 执行游戏特殊动作
            const currentAction = this.actionList[0];
            this.latencyLogger.log('runGameTask: action ' + currentAction.constructor.name);
            await currentAction.execute(ab, harvest, () => {
                this.actionList.shift();
            });
            this.latencyLogger.log('runGameTask: action ' + currentAction.constructor.name + ' finished');
            this.latencyLogger.finish();
            return;
        }

        // 执行默认的输出任务
        // 获取脉冲播放列表中的当前脉冲
        let pulseId = this.pulsePlayList.getCurrentPulseId();

        // 随机强度
        const strengthChangeInterval = this.gameConfig.strengthChangeInterval;
        let outputTime = randomInt(strengthChangeInterval[0], strengthChangeInterval[1]) * 1000;
        let targetStrength = this.globalStrengthConfig.strength + randomInt(0, this.globalStrengthConfig.randomStrength);
        targetStrength = Math.min(targetStrength, this.clientStrength.limit);

        let currentStrength = this.client.strength.strength;
        if (targetStrength > currentStrength) { // 递增强度
            let setStrengthInterval = setInterval(() => {
                if (ab.signal.aborted) { // 任务被中断
                    clearInterval(setStrengthInterval);
                    return;
                }

                this.setClientStrength(currentStrength).catch((error) => {
                    console.error('Failed to set strength:', error);
                });

                if (currentStrength >= targetStrength) {
                    clearInterval(setStrengthInterval);
                }

                currentStrength = Math.min(currentStrength + 2, targetStrength);
            }, 200);
        } else {
            this.setClientStrength(targetStrength).catch((error) => {
                console.error('Failed to set strength:', error);
            });
        }

        harvest();

        // 输出脉冲，直到下次随机强度时间
        await this.client.outputPulse(pulseId, outputTime, {
            abortController: ab,
            bChannel: this.gameConfig.enableBChannel,
            customPulseList: this.customPulseList,  // 自定义波形列表
        });
    }

    /**
     * 开启游戏
     * @param ignoreEvent 
     */
    public async startGame(ignoreEvent = false): Promise<void> {
        if (!this.client) {
            return;
        }

        if (!this.gameTask) {
            // 初始化强度和脉冲
            await this.client.reset();

            let initStrength = this.globalStrengthConfig.strength;
            initStrength = Math.min(initStrength, this.clientStrength.limit); // 限制初始强度不超过限制

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

            if (!ignoreEvent) {
                this.events.emit('gameStopped');
            }

            await this.client?.reset();
        }
    }

    /**
     * 重启游戏
     * 
     * 每次更新配置后都需要重启游戏
     */
    public async restartGame(): Promise<void> {
        if (!this.client) {
            return;
        }

        if (this.running) {
            await this.stopGame(true);
            await this.startGame(true);
            this.latencyLogger.finish();
        }
    }

    /**
     * 仅重启游戏任务，用于低延迟的强度调整
     */
    public async restartGameTask(): Promise<void> {
        if (!this.client) {
            return;
        }

        if (this.running && this.gameTask) {
            await this.client.reset();
            this.latencyLogger.log('resetClient');
            this.gameTask.restart();
        }
    }

    public handleSocketDisconnected(): void {
        if (this.onlineSockets.size === 0) {
            this.destroy().catch((error) => {
                console.error('Failed to destroy CoyoteLiveGame:', error);
            });
        }
    }

    public async destroy(): Promise<void> {
        if (this.gameTask) {
            await this.gameTask.stop();
        }

        this.events.emit('close');

        // 保存配置, 以便下次连接时恢复
        const configCachePrefix = `coyoteLiveGameConfig:${this.clientId}:`;
        const configCache  = CoyoteGameManager.instance.configCache;
        configCache.set(`${configCachePrefix}:strength`, this.globalStrengthConfig);


        this.eventStore.removeAllListeners();
        this.events.removeAllListeners();
    }

    public on = this.events.on.bind(this.events);
    public once = this.events.once.bind(this.events);
    public off = this.events.off.bind(this.events);
    public removeAllListeners = this.events.removeAllListeners.bind(this.events);
}
