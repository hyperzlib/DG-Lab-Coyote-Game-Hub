import { EventEmitter } from 'events';

import { Channel } from '#app/types/dg.js';
import { DGLabWSClient, StrengthInfo } from '../ws/DGLabWS.js';
import { Task } from '#app/utils/task.js';
import { asleep, includesPrefix, randomInt, simpleObjDiff } from '#app/utils/utils.js';
import { EventStore } from '#app/utils/EventStore.js';
import { CoyoteGameManager } from '#app/managers/CoyoteGameManager.js';
import { MainGameConfig, TargetChannelEnum, ChannelEnum, GameStrengthConfig, ChannelGameStrengthConfig } from '#app/types/game.js';
import { CoyoteGameConfigService, GameConfigType } from '#app/services/CoyoteGameConfigService.js';
import { PulsePlayList } from '#app/utils/PulsePlayList.js';
import { AbstractGameAction } from './actions/AbstractGameAction.js';
import { WebWSClient } from '../ws/WebWS.js';
import { DGLabPulseInfo } from '#app/services/DGLabPulse.js';
import { LatencyLogger } from '#app/utils/latencyLogger.js';

export type GameStrengthInfo = StrengthInfo & {
    tempStrength: number;
};

export type Channelify<T> = {
    main: T;
    channelB: T;
};

export interface CoyoteGameEvents {
    close: [];
    strengthChanged: [strength: Channelify<GameStrengthInfo>];
    strengthConfigUpdated: [config: GameStrengthConfig];
    clientConnected: [];
    clientDisconnected: [];
    gameStarted: [];
    gameStopped: [];
}

export class CoyoteGameController {
    /** 在线Socket的ID列表，用于判断是否可以释放Game */
    private onlineSockets = new Set<string>();

    /** 延迟调试 */
    private latencyLogger = new LatencyLogger();

    /** 游戏对应的clientId */
    public clientId: string;

    /** DG-Lab客户端连接 */
    public client?: DGLabWSClient;

    /** 强度配置 */
    public strengthConfig: GameStrengthConfig = {
        main: {
            strength: 5,
            randomStrength: 5,
        },
        channelB: {
            strength: 5,
            randomStrength: 5,
        },
    };

    public gameConfigService = CoyoteGameConfigService.instance;

    public gameConfig!: MainGameConfig;

    /** 强度配置更改时间 */
    public strengthConfigModified: number = 0;

    /** 强度设置时间 */
    public strengthSetTime: number = 0;

    /** 当前游戏Action列表 */
    public actionList: AbstractGameAction[] = [];

    private _tempStrength: Channelify<number> = {
        main: 0,
        channelB: 0,
    };

    /** 自定义波形列表 */
    public customPulseList: DGLabPulseInfo[] = [];

    /** 波形播放列表 */
    public pulsePlayList: Channelify<PulsePlayList | undefined> = {
        main: undefined,
        channelB: undefined,
    }

    public events = new EventEmitter<CoyoteGameEvents>();

    private eventStore: EventStore = new EventStore();

    /** 输出循环Task */
    private outputLoopTask: Channelify<Task | null> = {
        main: null,
        channelB: null,
    };

    public get tempStrength(): Channelify<number> {
        return this._tempStrength;
    }

    public clientStrength: Channelify<StrengthInfo> = {
        main: this.client?.strength ?? {
            strength: 0,
            limit: 20,
        },
        channelB: this.client?.strengthChannelB ?? {
            strength: 0,
            limit: 20,
        },
    };

    public gameStrength: Channelify<GameStrengthInfo> = {
        main: {
            ...this.clientStrength.main,
            tempStrength: this._tempStrength.main,
        },
        channelB: {
            ...this.clientStrength.channelB,
            tempStrength: this._tempStrength.channelB,
        },
    };

    private updateStrengthInfo(): void {
        this.clientStrength = {
            main: this.client?.strength ?? this.clientStrength.main,
            channelB: this.client?.strengthChannelB ?? this.clientStrength.channelB,
        };

        this.gameStrength = {
            main: {
                ...this.clientStrength.main,
                tempStrength: this._tempStrength.main,
            },
            channelB: {
                ...this.clientStrength.channelB,
                tempStrength: this._tempStrength.channelB,
            },
        };

        this.events.emit('strengthChanged', this.gameStrength);
    }

    constructor(clientId: string) {
        this.clientId = clientId;
    }

    async initialize(): Promise<void> {
        this.gameConfig = await CoyoteGameConfigService.instance.get(this.clientId, GameConfigType.MainGame, true);

        const customPulseConfig = await CoyoteGameConfigService.instance.get(this.clientId, GameConfigType.CustomPulse, true);
        this.customPulseList = customPulseConfig.customPulseList ?? [];

        // 初始化波形列表
        const pulseConfigMain = this.gameConfig.pulse.main;
        let pulseListmain = typeof pulseConfigMain.pulseId === 'string' ? [pulseConfigMain.pulseId] : pulseConfigMain.pulseId;
        this.pulsePlayList.main = new PulsePlayList(pulseListmain, pulseConfigMain.pulseMode, pulseConfigMain.pulseChangeInterval);

        const pulseConfigB = this.gameConfig.pulse.channelB;
        let pulseListB = typeof pulseConfigB.pulseId === 'string' ? [pulseConfigB.pulseId] : pulseConfigB.pulseId;
        this.pulsePlayList.channelB = new PulsePlayList(pulseListB, pulseConfigB.pulseMode, pulseConfigB.pulseChangeInterval);

        // 从缓存中恢复游戏状态
        const configCachePrefix = `coyoteLiveGameConfig:${this.clientId}:`;
        const configCache = CoyoteGameManager.instance.configCache;
        let hasCachedConfig = false;

        let cachedGameStrengthConfig = configCache.get(`${configCachePrefix}:strength`);
        if (cachedGameStrengthConfig) {
            this.strengthConfig = cachedGameStrengthConfig;
            this.strengthConfigModified = Date.now();
            hasCachedConfig = true;
        }

        if (hasCachedConfig) { // 有缓存配置时需要通知控制器更新配置
            this.events.emit('strengthConfigUpdated', this.strengthConfig);
        }

        // 监听游戏配置更新事件
        const configEvents = this.eventStore.wrap(this.gameConfigService);
        configEvents.on('configUpdated', `${this.clientId}/${GameConfigType.MainGame}`, (type, newConfig) => {
            this.handleConfigUpdated(newConfig);
        });

        configEvents.on('configUpdated', `${this.clientId}/${GameConfigType.CustomPulse}`, (type, newConfig) => {
            this.customPulseList = newConfig.customPulseList;
        });
    }

    public get running() {
        // 两个loop会同时运行或同时停止，所以判断main loop是否存在和运行中即可
        return this.outputLoopTask.main?.running ?? false;
    }

    public async bindClient(client: DGLabWSClient): Promise<void> {
        this.client = client;
        this.onlineSockets.add('dgclient');

        this.events.emit('clientConnected');
        this.events.emit('gameStopped');

        await this.setClientStrength(0, 'all');
        // 必须先清空临时强度
        this._tempStrength = {
            main: 0,
            channelB: 0,
        };
        
        // 更新强度信息，触发前端更新UI
        this.updateStrengthInfo();

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
        clientEvents.on('strengthChanged', (_, __) => {
            this.updateStrengthInfo();
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

    public setTempStrength(value: number, channel: 'all' | 'main' | 'channelB'): void {
        if (channel === 'all') {
            this._tempStrength.main = value;
            this._tempStrength.channelB = value;
        } else {
            this._tempStrength[channel] = value;
        }
        this.updateStrengthInfo();
    }

    /**
     * 更新游戏强度配置
     * @param config 
     */
    public async updateStrengthConfig(config: ChannelGameStrengthConfig, channel: TargetChannelEnum): Promise<void> {
        if (channel === 'all') {
            // 同时更新两个通道的强度配置
            await this.updateStrengthConfig(config, 'main');
            await this.updateStrengthConfig(config, 'channelB');
            return;
        }

        let deltaStrength = 0;

        const currentChannelConfig = this.strengthConfig[channel];
        if (simpleObjDiff(config, currentChannelConfig)) {
            this.strengthConfig[channel] = config;
            this.strengthConfigModified = Date.now();

            this.events.emit('strengthConfigUpdated', this.strengthConfig);

            if (this.client) { // 客户端已连接时才更新强度
                deltaStrength = config.strength - this.clientStrength[channel].strength;

                if (deltaStrength <= 5) {
                    // 如果强度增加不超过5，则直接设置强度
                    // 在GameApi连续加减时，这么做可以防止波形大量中断
                    await this.setClientStrength(config.strength, channel);
                } else {
                    // 重启波形输出
                    await this.reloadGameTask(channel);
                }
            }
        }
    }

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
            
            let restartPromises: Promise<void>[] = [];
            if (action.isApplicableToChannel('main')) {
                restartPromises.push(this.reloadGameTask('main'));
            }
            if (action.isApplicableToChannel('channelB')) {
                restartPromises.push(this.reloadGameTask('channelB'));
            }

            await Promise.all(restartPromises);
        }
    }

    /**
     * 强制结束一个游戏动作
     * @param action 
     */
    public async stopAction(action: AbstractGameAction): Promise<void> {
        let existsIndex = this.actionList.findIndex((a) => a.constructor === action.constructor);
        if (existsIndex >= 0) {
            const actionRunners = this.actionList.splice(existsIndex, 1);
            actionRunners.forEach((runner) => {
                runner._destroy()
            });

            if (existsIndex === 0) { // 移除的是当前执行的动作
                // 重启波形输出
                await this.reloadGameTask('all');
            }
        }
    }

    /**
     * 游戏配置更新处理
     * @param newGameConfig 
     * @returns 
     */
    private handleConfigUpdated(newGameConfig: MainGameConfig): void {
        let diffKeys = simpleObjDiff(newGameConfig, this.gameConfig);

        this.gameConfig = newGameConfig;

        if (!diffKeys) return;

        let shouldRestartGame = false;

        // 以下配置项更改需要重启游戏以立即发送新的波形或强度配置
        let shouldRestartGameKeys = [
            'pulse.main.pulseId',
            'pulse.main.pulseMode',
            'pulse.main.pulseChangeInterval',

            'pulse.channelB.pulseId',
            'pulse.channelB.pulseMode',
            'pulse.channelB.pulseChangeInterval',

            'strengthChangeInterval',

            'bChannelMode',
            'bChannelStrengthMultiplier'
        ];

        for (let key of diffKeys) {
            if (shouldRestartGameKeys.includes(key)) {
                shouldRestartGame = true;
                break;
            }
        }

        if (includesPrefix(diffKeys as string[], 'pulse.main')) {
            // 更新波形播放列表
            console.log('[Debug] Main pulse config changed, updating pulse play list');
            const pulseConfigMain = this.gameConfig.pulse.main;
            let pulseListmain = typeof pulseConfigMain.pulseId === 'string' ? [pulseConfigMain.pulseId] : pulseConfigMain.pulseId;
            this.pulsePlayList.main = new PulsePlayList(pulseListmain, pulseConfigMain.pulseMode, pulseConfigMain.pulseChangeInterval);
        }

        if (includesPrefix(diffKeys as string[], 'pulse.channelB')) {
            // 更新波形播放列表
            console.log('[Debug] Channel B pulse config changed, updating pulse play list');
            const pulseConfigB = this.gameConfig.pulse.channelB;
            let pulseListB = typeof pulseConfigB.pulseId === 'string' ? [pulseConfigB.pulseId] : pulseConfigB.pulseId;
            this.pulsePlayList.channelB = new PulsePlayList(pulseListB, pulseConfigB.pulseMode, pulseConfigB.pulseChangeInterval);
        }

        if (shouldRestartGame) {
            this.reloadGameTask('all').catch((error) => {
                console.error('Failed to reload game task:', error);
            });
        }
    }

    /**
     * 设置客户端强度
     * @param strength 强度
     * @returns 
     */
    public async setClientStrength(strength: number, channel: TargetChannelEnum): Promise<void> {
        if (!this.client?.active) {
            return;
        }

        switch (channel) {
            case 'main':
                await this.client.setStrength(Channel.A, strength);
                if (this.gameConfig.bChannelMode === 'sync') {
                    // 如果B通道与A通道同步，则B通道强度也随之调整
                    let bStrength = Math.min(strength * this.gameConfig.bChannelStrengthMultiplier, this.clientStrength.channelB.limit);
                    await this.client.setStrength(Channel.B, bStrength);
                }
                break;
            case 'channelB':
                if (this.gameConfig.bChannelMode === 'discrete') {
                    await this.client.setStrength(Channel.B, strength);
                }
                break;
            case 'all':
                await this.setClientStrength(strength, 'main');
                await this.setClientStrength(strength, 'channelB');
                break;
        }

        this.strengthSetTime = Date.now();
    }

    private cleanupActions(): void {
        this.actionList = this.actionList.filter((action) => {
            if (action._isFinished()) {
                action._destroy();
                return false;
            }
            return true;
        });
    }

    /**
     * 运行输出任务
     * @param ab 
     * @param harvest 
     * @returns 
     */
    private async runOutputLoopTask(channel: ChannelEnum, ab: AbortController, harvest: () => void, round: number): Promise<void> {
        if (!this.client) {
            // 如果客户端未连接，停止游戏任务
            this.stopGame().catch((error) => {
                console.error('Failed to stop game:', error);
            });
            return;
        }

        let clientChannel = Channel.A;
        if (channel === 'channelB') {
            clientChannel = Channel.B;
        }

        if (channel === 'channelB' && this.gameConfig.bChannelMode === 'off') {
            // 如果B通道关闭，则直接idle等待下一轮
            await asleep(10 * 1000, ab);
            return;
        }

        if (this.actionList.length > 0) {
            // 尝试清理已结束的动作
            this.cleanupActions();

            // 执行游戏特殊动作
            let hasApplicableAction = false;
            
            for (const actionRunner of this.actionList) {
                if (ab.signal.aborted) { // 任务被中断
                    return;
                }

                if (actionRunner._isFinished()) {
                    continue;
                }

                if (!actionRunner.isApplicableToChannel(channel)) {
                    continue;
                }

                hasApplicableAction = true;

                this.latencyLogger.log('startOutputLoopTask: action ' + actionRunner.constructor.name);
                await actionRunner.execute(channel, ab, harvest);
                this.latencyLogger.log('startOutputLoopTask: action ' + actionRunner.constructor.name + ' finished');
                this.latencyLogger.finish();
                return;
            }

            // 如果有适用于当前通道的动作正在执行，则不执行默认输出
            if (hasApplicableAction) {
                return;
            }
        }

        // 执行默认的输出任务
        // 获取脉冲播放列表中的当前脉冲
        let pulseId = this.pulsePlayList[channel]?.getCurrentPulseId() ?? '';

        // 随机强度
        const strengthChangeInterval = this.gameConfig.strengthChangeInterval;
        let outputTime = randomInt(strengthChangeInterval[0], strengthChangeInterval[1]) * 1000;
        
        let currentStrength = this.clientStrength[channel].strength;
        let targetStrength = 0;
        
        // 计算目标强度
        if (channel === 'main') {
            targetStrength = this.strengthConfig.main.strength + randomInt(0, this.strengthConfig.main.randomStrength);
        } else if (channel === 'channelB') {
            if (this.gameConfig.bChannelMode === 'sync') {
                // 如果B通道与A通道同步，则B通道强度基于A通道强度计算
                const mainTargetStrength = this.strengthConfig.main.strength + randomInt(0, this.strengthConfig.main.randomStrength);
                targetStrength = mainTargetStrength * this.gameConfig.bChannelStrengthMultiplier;
            } else {
                targetStrength = this.strengthConfig.channelB.strength + randomInt(0, this.strengthConfig.channelB.randomStrength);
            }
        }
        targetStrength = Math.min(targetStrength, this.clientStrength[channel].limit);

        if (targetStrength > currentStrength) { // 递增强度
            let setStrengthInterval = setInterval(() => {
                if (ab.signal.aborted) { // 任务被中断
                    clearInterval(setStrengthInterval);
                    return;
                }

                this.setClientStrength(currentStrength, channel).catch((error) => {
                    console.error('Failed to set strength:', error);
                });

                if (currentStrength >= targetStrength) {
                    clearInterval(setStrengthInterval);
                }

                currentStrength = Math.min(currentStrength + 2, targetStrength);
            }, 200);
        } else {
            this.setClientStrength(targetStrength, channel).catch((error) => {
                console.error('Failed to set strength:', error);
            });
        }

        harvest();

        // 输出脉冲，直到下次随机强度时间
        await this.client.outputPulse(clientChannel, pulseId, outputTime, {
            abortController: ab,
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

        if (!this.running) {
            // 初始化强度和脉冲
            await this.client.resetAll();
            
            // 启动游戏任务
            this.outputLoopTask.main = new Task((ab, harvest, round) =>
                this.runOutputLoopTask('main', ab, harvest, round));
            
            this.outputLoopTask.main.on('error', (error) => {
                console.error('Game task error:', error);
            });

            this.outputLoopTask.channelB = new Task((ab, harvest, round) =>
                this.runOutputLoopTask('channelB', ab, harvest, round));
            
            this.outputLoopTask.channelB.on('error', (error) => {
                console.error('Channel B game task error:', error);
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
        if (this.outputLoopTask.main) {
            await this.outputLoopTask.main.abort();
            this.outputLoopTask.main = null;
        }
        if (this.outputLoopTask.channelB) {
            await this.outputLoopTask.channelB.abort();
            this.outputLoopTask.channelB = null;
        }

        await this.client?.resetAll(); // 停止游戏时重置通道状态

        if (!ignoreEvent) {
            this.events.emit('gameStopped');
        }
    }

    /**
     * 重启游戏任务
     * @param channel 
     * 每次更新配置后都需要重启游戏任务
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
    public async reloadGameTask(channel: TargetChannelEnum): Promise<void> {
        if (!this.client) {
            return;
        }

        if (channel === 'all') {
            await Promise.all([
                this.reloadGameTask('main'),
                this.reloadGameTask('channelB'),
            ]);
            return;
        }

        if (this.running && this.outputLoopTask[channel]) {
            let clientChannel = Channel.A;
            if (channel === 'channelB') {
                clientChannel = Channel.B;
            }

            await this.client.resetChannel(clientChannel);
            this.latencyLogger.log('resetClient');
            this.outputLoopTask[channel].restart();
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
        if (this.outputLoopTask.main) {
            await this.outputLoopTask.main.stop();
        }
        if (this.outputLoopTask.channelB) {
            await this.outputLoopTask.channelB.stop();
        }

        this.events.emit('close');

        // 缓存强度配置, 以便下次连接时快速恢复
        const configCachePrefix = `coyoteLiveGameConfig:${this.clientId}:`;
        const configCache = CoyoteGameManager.instance.configCache;
        configCache.set(`${configCachePrefix}:strength`, this.strengthConfig);

        this.eventStore.removeAllListeners();
        this.events.removeAllListeners();
    }

    public on = this.events.on.bind(this.events);
    public once = this.events.once.bind(this.events);
    public off = this.events.off.bind(this.events);
    public removeAllListeners = this.events.removeAllListeners.bind(this.events);
}
