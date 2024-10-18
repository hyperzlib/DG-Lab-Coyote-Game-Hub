import { v4 as uuidv4 } from "uuid";
import { EventEmitter } from "eventemitter3";
import { EventDef, EventAddListenerFunc, EventRemoveListenerFunc } from "../utils/event";

export type WebSocketMessage = {
    action: string;
} & Record<string, any>;

export type WebSocketServerMessage = {
    event: string;
    requestId?: string;
    data?: any;
};

export type PendingRequestInfo = {
    requestId: string;
    expires: number;
    resolve: (data: any) => void;
    reject: (error: any) => void;
};

export type PulseItemResponse = {
    id: string;
    name: string;
    pulseData: string[];
};

export type GameStrengthInfo = {
    strength: number;
    limit: number;
    tempStrength: number;
};

export enum GameConfigType {
    MainGame = 'main-game',
    CustomPulse = 'custom-pulse',
}

export type PulsePlayMode = 'single' | 'sequence' | 'random';

export type RemoteNotificationInfo = {
    title?: string;
    message: string;
    icon?: string;
    severity?: string;
    ignoreId?: string;
    sticky?: boolean;
    url?: string;
    urlLabel?: string;
};

export interface GameStrengthConfig {
    strength: number;
    randomStrength: number;
}

export interface MainGameConfig {
    strengthChangeInterval: [number, number];

    enableBChannel: boolean;
    /** B通道强度倍率 */
    bChannelStrengthMultiplier: number;

    pulseId: string | string[];
    firePulseId?: string | null;

    pulseMode: PulsePlayMode;
    pulseChangeInterval: number;
}

export interface GameCustomPulseConfig {
    customPulseList: any[];
}

export interface SocketApiEventListeners extends EventDef {
    error: [error: any];
    open: [];
    remoteNotification: [notification: RemoteNotificationInfo];
    pulseListUpdated: [pulseList: PulseItemResponse[]];
    clientConnected: [];
    clientDisconnected: [];
    gameStarted: [];
    gameStopped: [];
    strengthChanged: [strength: GameStrengthInfo];
    strengthConfigUpdated: [config: GameStrengthConfig];
    mainGameConfigUpdated: [config: MainGameConfig];
    customPulseConfigUpdated: [config: GameCustomPulseConfig];
}

export class SocketApi {
    private socket!: WebSocket;
    private socketUrl: string;
    private reconnectAttempts: number = 0;

    private shouldClose = false;

    private events = new EventEmitter();

    private pendingRequests: Map<string, PendingRequestInfo> = new Map();

    constructor(wsUrl: string) {
        if (wsUrl.startsWith("/")) { // Relative path
            const protocol = window.location.protocol === "https:" ? "wss" : "ws";
            wsUrl = `${protocol}://${window.location.host}${wsUrl}`;
        }
        this.socketUrl = wsUrl;
    }

    public get isConnected() {
        return this.socket.readyState === WebSocket.OPEN;
    }

    public connect() {
        this.socket = new WebSocket(this.socketUrl);
        this.init();
    }

    public on: EventAddListenerFunc<SocketApiEventListeners> = this.events.on.bind(this.events);
    public once: EventAddListenerFunc<SocketApiEventListeners> = this.events.once.bind(this.events);
    public off: EventRemoveListenerFunc<SocketApiEventListeners> = this.events.off.bind(this.events);

    public async send(data: WebSocketMessage): Promise<string> {
        data.requestId = uuidv4();
        const dataStr = JSON.stringify(data);
        this.socket.send(dataStr);

        return data.requestId;
    }

    public sendRequest(data: WebSocketMessage, expires: number = 5000): Promise<WebSocketServerMessage> {
        return new Promise((resolve, reject) => {
            this.send(data).then((requestId: string) => {
                this.pendingRequests.set(requestId, {
                    requestId,
                    expires: Date.now() + expires,
                    resolve,
                    reject,
                });
            });
        });
    }

    public init() {
        this.socket.addEventListener("open", () => {
            this.reconnectAttempts = 0;
            
            window.addEventListener("beforeunload", this.handleWindowClose);

            this.events.emit("open");
        });

        this.socket.addEventListener("message", (event) => {
            if (typeof event.data === 'string') {
                let message: WebSocketServerMessage;

                try {
                    message = JSON.parse(event.data);
                } catch (error) {
                    console.error("Failed to parse WebSocket message:", event.data);
                    return;
                }

                this.handleMessage(message);
            }
        });

        this.socket.addEventListener("close", () => {
            if (this.shouldClose) return;

            this.events.emit("error", new Error("Socket closed."));

            this.handleUnexpectedClose();
        });

        this.socket.addEventListener("error", (error) => {
            console.error("WebSocket error:", error);
            this.events.emit("error", error);
        });
    }

    private handleWindowClose = () => {
        this.close();
    };

    private handleUnexpectedClose() {
        console.log('Attempt to reconnect to server.');
        this.reconnectAttempts ++;

        let reconnectInterval = 1000;
        if (this.reconnectAttempts > 10) { // 重连失败5次后，降低重连频率
            reconnectInterval = 5000;
        }

        try {
            this.socket.close();
        } catch (err: any) {
            console.error("Cannot close socket:", err);
        }

        window.removeEventListener("beforeunload", this.handleWindowClose);

        // Reconnect
        setTimeout(() => {
            this.connect();
        }, reconnectInterval);
    }

    public bindClient(clientId: string) {
        return this.sendRequest({
            action: "bindClient",
            clientId,
        });
    }

    public updateStrengthConfig(config: GameStrengthConfig) {
        return this.sendRequest({
            action: "updateStrengthConfig",
            config,
        });
    }

    public updateConfig(type: string, newConfig: any) {
        return this.sendRequest({
            action: "updateConfig",
            type,
            config: newConfig,
        });
    }

    public startGame() {
        return this.sendRequest({
            action: "startGame",
        });
    }

    public stopGame() {
        return this.sendRequest({
            action: "stopGame",
        });
    }

    private async handleMessage(message: WebSocketServerMessage): Promise<void> {
        if (import.meta.env.DEV && message?.event !== 'heartbeat') { // 调试输出
            console.log('websocket message', message);
        }

        switch (message.event) {
            case "response":
                if (message.requestId) {
                    const requestInfo = this.pendingRequests.get(message.requestId);
                    if (requestInfo) {
                        this.pendingRequests.delete(message.requestId);
                        requestInfo.resolve(message.data);
                    } else {
                        console.warn("Received response for unknown request:", message.requestId);
                    }
                } else {
                    console.warn("Received response without requestId:", message);
                }
                break;
            case "pulseListUpdated":
                this.events.emit("pulseListUpdated", message.data);
                break;
            case "gameStarted":
                this.events.emit("gameStarted");
                break;
            case "gameStopped":
                this.events.emit("gameStopped");
                break;
            case "clientConnected":
                this.events.emit("clientConnected");
                break;
            case "clientDisconnected":
                this.events.emit("clientDisconnected");
                break;
            case "strengthChanged":
                this.events.emit("strengthChanged", message.data);
                break;
            case "strengthConfigUpdated":
                this.events.emit("strengthConfigUpdated", message.data);
                break;
            case "gameConfigUpdated":
                switch (message.data.type) {
                    case GameConfigType.MainGame:
                        this.events.emit("mainGameConfigUpdated", message.data.config);
                        break;
                    case GameConfigType.CustomPulse:
                        this.events.emit("customPulseConfigUpdated", message.data.config);
                        break;
                    default:
                        console.warn("Unknown game config type:", message.data.type);
                }
                break;
            case "remoteNotification":
                this.events.emit("remoteNotification", message.data);
                break;
            case "heartbeat":
                this.send({
                    action: "heartbeat",
                });
                break;
            default:
                console.warn("Unknown event:", message.event, message);
                break;
        }
    };

    public close() {
        this.shouldClose = true;
        this.socket.close();
        window.removeEventListener('beforeunload', this.handleWindowClose);

        this.events.emit('close');
    };
}
