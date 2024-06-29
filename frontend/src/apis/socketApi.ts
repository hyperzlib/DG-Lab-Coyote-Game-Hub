import { v4 as uuidv4 } from "uuid";
import { EventEmitter } from "eventemitter3";

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
};

export type StrengthInfo = {
    strength: number;
    limit: number;
};

export type RandomStrengthConfig = {
    minStrength: number;
    maxStrength: number;
    minInterval: number;
    maxInterval: number;
    bChannelMultiplier?: number;
}

export type CoyoteLiveGameConfig = {
    strength: RandomStrengthConfig;
    pulseId: string;
}

export interface SocketApiEventListeners {
    (event: 'error', listener: (error: any) => void): void;
    (event: 'open', listener: () => void): void;
    (event: 'pulseListUpdated', listener: (pulseList: PulseItemResponse[]) => void): void;
    (event: 'clientConnected', listener: () => void): void;
    (event: 'clientDisconnected', listener: () => void): void;
    (event: 'gameInitialized', listener: () => void): void;
    (event: 'gameStarted', listener: () => void): void;
    (event: 'gameStopped', listener: () => void): void;
    (event: 'strengthChanged', listener: (strength: StrengthInfo) => void): void;
    (event: 'configUpdated', listener: (config: CoyoteLiveGameConfig) => void): void;
}

export class SocketApi {
    private socket!: WebSocket;
    private socketUrl: string;
    private reconnectAttempts: number = 0;

    private events = new EventEmitter();

    private pendingRequests: Map<string, PendingRequestInfo> = new Map();

    constructor(wsUrl: string) {
        if (wsUrl.startsWith("/")) { // Relative path
            const protocol = window.location.protocol === "https:" ? "wss" : "ws";
            wsUrl = `${protocol}://${window.location.host}${wsUrl}`;
        }
        this.socketUrl = wsUrl;
    }

    public connect() {
        this.socket = new WebSocket(this.socketUrl);
        this.init();
    }

    public on: SocketApiEventListeners = this.events.on.bind(this.events);
    public once: SocketApiEventListeners = this.events.once.bind(this.events);
    public off = this.events.off.bind(this.events);

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
            this.events.emit("close");

            window.removeEventListener("beforeunload", this.handleWindowClose);
        });

        this.socket.addEventListener("error", (error) => {
            this.reconnectAttempts ++;
            let reconnectInterval = 1000;
            if (this.reconnectAttempts > 5) { // 重连失败5次后，降低重连频率
                reconnectInterval = 5000;
            }

            console.error("WebSocket error:", error);
            window.removeEventListener("beforeunload", this.handleWindowClose);
            // Reconnect
            setTimeout(() => {
                this.connect();
            }, reconnectInterval);
        });
    }

    private handleWindowClose = () => {
        this.socket.close();
    };

    public bindClient(clientId: string) {
        return this.sendRequest({
            action: "bindClient",
            clientId,
        });
    }

    public updateConfig(gameConfig: CoyoteLiveGameConfig) {
        return this.sendRequest({
            action: "updateConfig",
            config: gameConfig,
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
        console.log('websocket message', message);
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
            case "gameInitialized":
                this.events.emit("gameInitialized");
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
            case "configUpdated":
                this.events.emit("configUpdated", message.data);
                break;
            case "heartbeat":
                this.send({
                    action: "heartbeat",
                });
                break;
            default:
                console.warn("Unknown event:", message.event, message);
        }
    };

    public close() {
        this.socket.close();
    }
}
