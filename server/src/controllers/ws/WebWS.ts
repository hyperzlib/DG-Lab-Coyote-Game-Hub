import { EventEmitter } from 'events';
import { AsyncWebSocket } from '../../utils/WebSocketAsync';
import { EventStore } from '../../utils/EventStore';
import { DGLabPulseService } from '../../services/DGLabPulse';
import { CoyoteLiveGameManager } from '../../managers/CoyoteLiveGameManager';
import { CoyoteLiveGame } from '../game/CoyoteLiveGame';

export type WebWSPostMessage = {
    event: string;
    requestId?: string;
    data?: any;
};

export class WebWSClient {
    public socket: AsyncWebSocket;
    public clientId: string = '';

    private eventStore = new EventStore();
    private gameEventStore = new EventStore();
    private eventEmitter = new EventEmitter();
    private heartbeatTask: NodeJS.Timeout | null = null;

    private gameInstance: CoyoteLiveGame | null = null;

    public constructor(socket: AsyncWebSocket) {
        this.socket = socket;
    }

    public async initialize(): Promise<void> {
        this.bindEvents();

        await this.sendPulseList(); // 发送波形列表
    }

    public async send(data: WebWSPostMessage): Promise<void> {
        await this.socket.sendAsync(JSON.stringify(data));
    }

    public async sendResponse(requestId: string, data: any): Promise<void> {
        await this.send({
            event: 'response',
            requestId,
            data,
        });
    }

    public async sendPulseList(): Promise<void> {
        const pulseList = DGLabPulseService.instance.pulseList.map((pulse) => {
            return {
                id: pulse.id,
                name: pulse.name,
            };
        });

        await this.send({
            event: 'pulseListUpdated',
            data: pulseList,
        });
    }

    public bindEvents() {
        const gameManagerEvents = this.eventStore.wrap(CoyoteLiveGameManager.instance);
        const pulseServiceEvents = this.eventStore.wrap(DGLabPulseService.instance);
        const socketEvents = this.eventStore.wrap(this.socket);

        gameManagerEvents.on("gameCreated", async (clientId, gameInstance) => {
            if (clientId !== this.clientId) {
                return;
            }

            this.connectToGame(gameInstance);
        });

        pulseServiceEvents.on("pulseListUpdated", async () => {
            await this.sendPulseList();
        });

        socketEvents.on("message", async (data, isBinary) => {
            if (isBinary) {
                return; // Ignore binary data
            }

            const message = JSON.parse(data.toString());

            if (!message.type) {
                console.log("Invalid message: " + data.toString());
                return;
            }

            await this.handleMessage(message);
        });

        socketEvents.on("close", () => {
            this.eventEmitter.emit("close");

            this.destory();
        });
    }

    private async handleMessage(message: any) {
        if (!message.action || !message.messageId) {
            console.log("Invalid message: " + JSON.stringify(message));
            return;
        }

        switch (message.action) {
            case 'bindClient':
                this.handleBindClient(message);
                break;
            case 'updateConfig':
                break;
            case 'startGame':
                break;
            case 'stopGame':
                break;
        }
    }

    private async handleBindClient(message: any) {
        if (!message.clientId) {
            await this.sendResponse(message.messageId, {
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

        await this.sendResponse(message.messageId, {
            status: 1,
        });
    }

    private async handleUpdateConfig(message: any) {
        
    }

    private async connectToGame(gameInstance: CoyoteLiveGame) {
        this.disconnectFromGame(); // 断开之前的连接

        this.gameInstance = gameInstance;

        const gameEvents = this.gameEventStore.wrap(gameInstance);
        gameEvents.on("close", () => {
            this.disconnectFromGame();

            this.send({
                event: 'gameClosed',
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
    }

    private async disconnectFromGame() {
        if (this.gameInstance) {
            this.gameEventStore.removeAllListeners();    
            this.gameInstance = null;
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
        this.eventEmitter.removeAllListeners();
    }
}