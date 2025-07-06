import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { AsyncWebSocket } from '#app/utils/WebSocketAsync.js';
import { EventStore } from '#app/utils/EventStore.js';
import { CoyoteGameManager } from '#app/managers/CoyoteGameManager.js';
import { CoyoteGameController } from '../game/CoyoteGameController.js';
import { DGLabPulseService } from '#app/services/DGLabPulse.js';
import { SiteNotificationService } from '#app/services/SiteNotificationService.js';
import { GameConfigType, GameCustomPulseConfigSchema, GameStrengthConfig, GameStrengthConfigSchema, MainGameConfigSchema } from '#app/types/game.js';
import { z } from 'koa-swagger-decorator';
import { GameModel } from '#app/models/GameModel.js';
import { ServerContext } from '#app/types/server.js';
import { CustomPulseModel } from '#app/models/CustomPulseModel.js';

export type WebWSPostMessage = {
    event: string;
    requestId?: string;
    data?: any;
};

export interface WebWSClientEvents {
    close: [];
};

export class WebWSClient {
    private ctx: ServerContext;

    public socket: AsyncWebSocket;

    public clientId: string = '';
    public socketId: string = uuidv4();

    public events = new EventEmitter<WebWSClientEvents>();

    private eventStore = new EventStore();
    private gameEventStore = new EventStore();
    private heartbeatTask: NodeJS.Timeout | null = null;
    private prevHeartbeatTime: number | null = null;

    private gameInstance: CoyoteGameController | null = null;

    public constructor(ctx: ServerContext, socket: AsyncWebSocket) {
        this.ctx = ctx;
        this.socket = socket;
    }

    public async initialize(): Promise<void> {
        this.bindEvents();

        // 发送波形列表
        await this.send({
            event: 'pulseListUpdated',
            data: DGLabPulseService.instance.getPulseInfoList(),
        });

        // 发送站点通知
        const siteNotifications = SiteNotificationService.instance.getNotifications();
        for (const notification of siteNotifications) {
            await this.send({
                event: 'remoteNotification',
                data: notification,
            });
        }

        this.heartbeatTask = setInterval(() => this.taskHeartbeat(), 15000);
    }

    public async send(data: WebWSPostMessage): Promise<void> {
        try {
            await this.socket.sendAsync(JSON.stringify(data));
        } catch (error) {
            console.error("Failed to send message:", error);
            this.close();
        }
    }

    public async sendResponse(requestId: string, data: any): Promise<void> {
        await this.send({
            event: 'response',
            requestId,
            data,
        });
    }

    public bindEvents() {
        const socketEvents = this.eventStore.wrap(this.socket);
        const pulseServiceEvents = this.eventStore.wrap(DGLabPulseService.instance);
        const siteNotificationEvents = this.eventStore.wrap(SiteNotificationService.instance);

        socketEvents.on("message", async (data, isBinary) => {
            if (isBinary) {
                return; // Ignore binary data
            }

            const message = JSON.parse(data.toString());

            await this.handleMessage(message);
        });

        socketEvents.on("error", (error) => {
            console.error("WebSocket error:", error);
        });

        socketEvents.on("close", () => {
            this.events.emit("close");

            this.destory();
        });

        // 监听波形列表更新事件
        pulseServiceEvents.on("pulseListUpdated", async (pulseList) => {
            await this.send({
                event: 'pulseListUpdated',
                data: pulseList,
            });
        });

        // 监听站点通知更新事件
        siteNotificationEvents.on("newNotification", async (notification) => {
            await this.send({
                event: 'remoteNotification',
                data: notification,
            });
        });
    }

    private async handleMessage(message: any) {
        if (!message.action || !message.requestId) {
            console.log("Invalid message: " + JSON.stringify(message));
            return;
        }

        try {
            switch (message.action) {
                case 'bindClient':
                    await this.handleBindClient(message);
                    break;
                case 'kickClient':
                    await this.handleKickClient(message);
                    break;
                case 'updateStrengthConfig':
                    await this.handleUpdateStrengthConfig(message);
                    break;
                case 'updateConfig':
                    await this.handleUpdateGameConfig(message);
                    break;
                case 'startGame':
                    await this.handleStartGame(message);
                    break;
                case 'stopGame':
                    await this.handleStopGame(message);
                    break;
                case 'heartbeat':
                    this.prevHeartbeatTime = Date.now();
                    break;
                default:
                    await this.sendResponse(message.requestId, {
                        status: 0,
                        message: '未知的 action: ' + message.action,
                    });
                    break;
            }
        } catch (error: any) {
            console.error("Failed to handle message:", error);
            await this.sendResponse(message.requestId, {
                status: 0,
                message: '错误: ' + error.message,
                detail: error,
            });
        }
    }

    private async handleBindClient(message: any) {
        if (!message.clientId) {
            await this.sendResponse(message.requestId, {
                status: 0,
                message: '数据包错误：client ID 不存在',
            });
            return;
        }

        this.clientId = message.clientId;

        // 发送服务器存储的配置信息
        const gameConfig = await GameModel.getByGameId(this.ctx.database, this.clientId);
        await this.send({
            event: 'gameConfigUpdated',
            data: {
                type: GameConfigType.MainGame,
                config: gameConfig,
            },
        });

        // 发送服务器存储的自定义波形
        const customPulseConfig = await CustomPulseModel.getPulseListByGameId(this.ctx.database, this.clientId);
        await this.send({
            event: 'gameConfigUpdated',
            data: {
                type: GameConfigType.CustomPulse,
                config: {
                    customPulseList: customPulseConfig.map(pulse => pulse.getBasePulseData()),
                },
            },
        });

        let gameInstance = await CoyoteGameManager.instance.getOrCreateGame(this.clientId);
        this.connectToGame(gameInstance);

        await this.sendResponse(message.requestId, {
            status: 1,
        });
    }

    private async handleKickClient(message: any) {
        if (!this.gameInstance) {
            await this.sendResponse(message.requestId, {
                status: 0,
                message: '游戏未连接',
            });
            return;
        }

        if (!this.gameInstance.client) {
            await this.sendResponse(message.requestId, {
                status: 0,
                message: '客户端未连接',
            });
            return;
        }

        await this.gameInstance.client.close();

        await this.sendResponse(message.requestId, {
            status: 1,
        });
    }

    private async handleUpdateStrengthConfig(message: any) {
        if (!this.gameInstance) {
            await this.sendResponse(message.requestId, {
                status: 0,
                message: '游戏未连接',
            });
            return;
        }

        if (!message.config) {
            await this.sendResponse(message.requestId, {
                status: 0,
                message: '数据包错误：config 不存在',
            });
            return;
        }

        let strengthConfig: GameStrengthConfig;
        try {
            strengthConfig = GameStrengthConfigSchema.parse(message.config);
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                await this.sendResponse(message.requestId, {
                    status: 0,
                    message: '数据包错误：config 格式错误',
                    detail: error.errors,
                });
                return;
            } else {
                await this.sendResponse(message.requestId, {
                    status: 0,
                    message: '数据包错误：config 格式错误',
                    detail: error,
                });
                return;
            }
        }

        await this.gameInstance.updateStrengthConfig(message.config);
    }

    private async handleUpdateGameConfig(message: any) {
        if (!message.type || !message.config) {
            await this.sendResponse(message.requestId, {
                status: 0,
                message: '数据包错误：type 或 config 参数为空',
            });
            return;
        }

        switch (message.type) {
            case GameConfigType.MainGame:
                try {
                    const config = MainGameConfigSchema.parse(message.config);
                    await GameModel.update(this.ctx.database, this.clientId, config);
                } catch (error: any) {
                    if (error instanceof z.ZodError) {
                        await this.sendResponse(message.requestId, {
                            status: 0,
                            message: '数据包错误：config 格式错误',
                            detail: error.errors,
                        });
                    } else {
                        await this.sendResponse(message.requestId, {
                            status: 0,
                            message: '数据包错误：config 格式错误',
                            detail: error,
                        });
                    }
                    return;
                }
                break;
            case GameConfigType.CustomPulse:
                try {
                    const config = GameCustomPulseConfigSchema.parse(message.config);
                    await CustomPulseModel.update(this.ctx.database, this.clientId, config.customPulseList);
                } catch (error: any) {
                    if (error instanceof z.ZodError) {
                        await this.sendResponse(message.requestId, {
                            status: 0,
                            message: '数据包错误：config 格式错误',
                            detail: error.errors,
                        });
                    } else {
                        await this.sendResponse(message.requestId, {
                            status: 0,
                            message: '数据包错误：config 格式错误',
                            detail: error,
                        });
                    }
                    return;
                }
                break;
            default:
                await this.sendResponse(message.requestId, {
                    status: 0,
                    message: '数据包错误：type 参数错误',
                });
                return;
        }
    }

    private async handleStartGame(message: any) {
        if (!this.gameInstance) {
            await this.sendResponse(message.requestId, {
                status: 0,
                message: '游戏未连接',
            });
            return;
        }

        try {
            await this.gameInstance.startGame();

            await this.sendResponse(message.requestId, {
                status: 1,
            });
        } catch (error: any) {
            const errId = uuidv4();
            await this.sendResponse(message.requestId, {
                status: 0,
                message: error.message,
                detail: error,
            });

            console.error(`[${errId}] Failed to start game:`, error);
        }
    }

    private async handleStopGame(message: any) {
        if (!this.gameInstance) {
            await this.sendResponse(message.requestId, {
                status: 0,
                message: '游戏未连接',
            });
            return;
        }

        try {
            await this.gameInstance.stopGame();
            
            await this.sendResponse(message.requestId, {
                status: 1,
            });
        } catch (error: any) {
            const errId = uuidv4();
            await this.sendResponse(message.requestId, {
                status: 0,
                message: error.message,
                detail: error,
            });

            console.error(`[${errId}] Failed to stop game:`, error);
        }
    }

    private async connectToGame(gameInstance: CoyoteGameController) {
        this.gameInstance = gameInstance;

        // 监听配置更新事件
        const gameModelEvents = this.gameEventStore.wrap(GameModel.events);
        gameModelEvents.on("configUpdated", this.clientId, async (gameConfig) => {
            await this.send({
                event: 'gameConfigUpdated',
                data: {
                    type: GameConfigType.MainGame,
                    config: gameConfig,
                }
            });
        });

        const customPulseModelEvents = this.gameEventStore.wrap(CustomPulseModel.events);
        customPulseModelEvents.on("pulseListUpdated", this.clientId, async () => {
            const customPulseConfig = await CustomPulseModel.getPulseListByGameId(this.ctx.database, this.clientId);

            await this.send({
                event: 'gameConfigUpdated',
                data: {
                    type: GameConfigType.CustomPulse,
                    config: {
                        customPulseList: customPulseConfig.map(pulse => pulse.getBasePulseData()),
                    },
                }
            });
        });

        // 绑定控制器，用于在所有控制器断开连接时回收游戏实例
        gameInstance.bindControllerSocket(this);

        const gameEvents = this.gameEventStore.wrap(gameInstance);
        gameEvents.on("clientConnected", async () => {
            await this.send({
                event: 'clientConnected',
                data: {}
            });
        });

        gameEvents.on("clientDisconnected", () => {
            this.send({
                event: 'clientDisconnected',
            });
        });

        gameEvents.on("gameStarted", async () => {
            await this.send({
                event: 'gameStarted',
            });
        });

        gameEvents.on("gameStopped", async () => {
            await this.send({
                event: 'gameStopped',
            });
        });

        gameEvents.on("strengthChanged", async (strength) => {
            await this.send({
                event: 'strengthChanged',
                data: strength,
            });
        });

        gameEvents.on("strengthConfigUpdated", (gameConfig) => {
            this.send({
                event: 'strengthConfigUpdated',
                data: gameConfig,
            });
        });

        // 发送当前强度
        await this.send({
            event: 'strengthChanged',
            data: gameInstance.gameStrength,
        });

        await this.send({
            event: 'strengthConfigUpdated',
            data: gameInstance.strengthConfig,
        });

        if (this.gameInstance.client) {
            await this.send({
                event: 'clientConnected',
                data: {}
            });
        }
        
        // 如果游戏已经开始，发送游戏开始事件
        if (this.gameInstance.running) {
            await this.send({
                event: 'gameStarted',
            });
        } else { // 确保控制器显示游戏停止状态
            await this.send({
                event: 'gameStopped',
            });
        }
    }

    private async taskHeartbeat() {
        if (this.prevHeartbeatTime && Date.now() - this.prevHeartbeatTime > 30000) { // 超过 30s 没有收到心跳包，断开连接
            this.close();
            return;
        }

        try {
            await this.send({
                event: 'heartbeat',
            });
        } catch (err: any) {
            console.error('Failed to send heartbeat:', err);
        }
    }

    public async close() {
        this.socket.close();
    }

    public destory() {
        if (this.heartbeatTask) {
            clearInterval(this.heartbeatTask);
        }

        this.eventStore.removeAllListeners();
        this.gameEventStore.removeAllListeners();

        this.events.emit("close");
        this.events.removeAllListeners();
    }

    public on = this.events.on.bind(this.events);
    public once = this.events.once.bind(this.events);
    public off = this.events.off.bind(this.events);
    public removeAllListeners = this.events.removeAllListeners.bind(this.events);
}