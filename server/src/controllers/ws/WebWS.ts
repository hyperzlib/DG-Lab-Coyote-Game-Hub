import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { AsyncWebSocket } from '../../utils/WebSocketAsync';
import { EventStore } from '../../utils/EventStore';
import { CoyoteLiveGameManager } from '../../managers/CoyoteLiveGameManager';
import { CoyoteLiveGame } from '../game/CoyoteLiveGame';
import { validator } from '../../utils/validator';

export type WebWSPostMessage = {
    event: string;
    requestId?: string;
    data?: any;
};

export interface WebWSClientEvents {
    close: [];
};

export class WebWSClient {
    public socket: AsyncWebSocket;
    public clientId: string = '';

    private eventStore = new EventStore();
    private gameEventStore = new EventStore();
    private events = new EventEmitter<WebWSClientEvents>();
    private heartbeatTask: NodeJS.Timeout | null = null;
    private prevHeartbeatTime: number | null = null;

    private gameInstance: CoyoteLiveGame | null = null;

    public constructor(socket: AsyncWebSocket) {
        this.socket = socket;
    }

    public async initialize(): Promise<void> {
        this.bindEvents();

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
        const gameManagerEvents = this.eventStore.wrap(CoyoteLiveGameManager.instance);
        const socketEvents = this.eventStore.wrap(this.socket);

        gameManagerEvents.on("gameCreated", async (clientId, gameInstance) => {
            if (clientId !== this.clientId) {
                return;
            }

            this.connectToGame(gameInstance, true);
        });

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
    }

    private async handleMessage(message: any) {
        if (!message.action || !message.requestId) {
            console.log("Invalid message: " + JSON.stringify(message));
            return;
        }

        switch (message.action) {
            case 'bindClient':
                await this.handleBindClient(message);
                break;
            case 'updateConfig':
                await this.handleUpdateConfig(message);
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

        let gameInstance = CoyoteLiveGameManager.instance.getGame(this.clientId);
        if (gameInstance) { // 如果已经有游戏实例，直接连接
            this.connectToGame(gameInstance);

            // 恢复游戏状态
            if (gameInstance.enabled) {
                await this.send({
                    event: 'gameStarted',
                });
            }

            await this.send({
                event: 'strengthChanged',
                data: gameInstance.clientStrength,
            });

            await this.send({
                event: 'configUpdated',
                data: gameInstance.gameConfig,
            });
        }

        await this.sendResponse(message.requestId, {
            status: 1,
        });
    }

    private async handleUpdateConfig(message: any) {
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
        } else if (!validator.validateCoyoteLiveGameConfig(message.config)) {
            await this.sendResponse(message.requestId, {
                status: 0,
                message: '数据包错误：config 格式错误',
                detail: validator.validateCoyoteLiveGameConfig.errors,
            });
            return;
        }

        this.gameInstance.updateConfig(message.config);
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

    private async connectToGame(gameInstance: CoyoteLiveGame, isInitGame = false) {
        this.disconnectFromGame(); // 断开之前的连接

        this.gameInstance = gameInstance;

        // 发送连接事件
        await this.send({
            event: 'clientConnected',
            data: {
                clientType: gameInstance.clientType,
            }
        });

        // 发送波形列表
        await this.send({
            event: 'pulseListUpdated',
            data: gameInstance.client.pulseList,
        })

        const gameEvents = this.gameEventStore.wrap(gameInstance);
        gameEvents.on("close", () => {
            this.disconnectFromGame();

            this.send({
                event: 'clientDisconnected',
            });
        });

        gameEvents.on("pulseListUpdated", async (pulseList) => {
            await this.send({
                event: 'pulseListUpdated',
                data: pulseList,
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

        gameEvents.on("configUpdated", (gameConfig) => {
            this.send({
                event: 'configUpdated',
                data: gameConfig,
            });
        });

        if (isInitGame) {
            // 如果是初始化游戏，发送初始化事件，此时客户端会上报当前的强度和配置
            await this.send({
                event: 'gameInitialized',
            });
            
            await this.send({
                event: 'strengthChanged',
                data: gameInstance.clientStrength,
            });
        } else {
            // 如果游戏已经开始，发送游戏开始事件
            if (this.gameInstance.enabled) {
                await this.send({
                    event: 'gameStarted',
                });
            }

            // 使用服务器端的强度和配置覆盖客户端的信息
            await this.send({
                event: 'strengthChanged',
                data: gameInstance.clientStrength,
            });

            await this.send({
                event: 'configUpdated',
                data: gameInstance.gameConfig,
            });
        }
    }

    private async disconnectFromGame() {
        if (this.gameInstance) {
            this.gameEventStore.removeAllListeners();    
            this.gameInstance = null;
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

        this.disconnectFromGame();
        this.eventStore.removeAllListeners();

        this.events.emit("close");
        this.events.removeAllListeners();
    }

    public on = this.events.on.bind(this.events);
    public once = this.events.once.bind(this.events);
    public off = this.events.off.bind(this.events);
    public removeAllListeners = this.events.removeAllListeners.bind(this.events);
}