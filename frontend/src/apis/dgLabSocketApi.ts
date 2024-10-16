import { EventEmitter } from "eventemitter3";
import { EventDef, EventAddListenerFunc, EventRemoveListenerFunc } from "../utils/event";
import { DGLabMessage, MessageDataHead, MessageType, RetCode } from "../type/dg";

export enum StrengthChangeMode {
    Sub = 0,
    Add = 1,
    Set = 2,
}

export enum CoyoteChannel {
    A = "A",
    B = "B",
}

export interface DGLabSocketApiEventListeners extends EventDef {
    bind: [targetId: string],
    setStrength: [channel: CoyoteChannel, mode: StrengthChangeMode, value: number],
    pulse: [channel: CoyoteChannel, pulseHex: string[]],
    clearPulse: [channel: CoyoteChannel],
    error: [error: Error],
    breakConnection: [],
    close: [],
}

export class DGLabSocketApi {
    private socket!: WebSocket;
    private socketUrl: string;
    private reconnectAttempts: number = 0;

    public clientId: string = "";

    private shouldClose = false;

    private events = new EventEmitter();

    constructor(wsUrl: string) {
        this.socketUrl = wsUrl;
    }

    public connect() {
        this.socket = new WebSocket(this.socketUrl);
        this.init();
    }

    public on: EventAddListenerFunc<DGLabSocketApiEventListeners> = this.events.on.bind(this.events);
    public once: EventAddListenerFunc<DGLabSocketApiEventListeners> = this.events.once.bind(this.events);
    public off: EventRemoveListenerFunc<DGLabSocketApiEventListeners> = this.events.off.bind(this.events);

    public async send(data: DGLabMessage): Promise<void> {
        const dataStr = JSON.stringify(data);
        this.socket.send(dataStr);
    }

    public init() {
        this.clientId = '';

        this.socket.addEventListener("open", () => {
            this.reconnectAttempts = 0;
            
            self.addEventListener("beforeunload", this.handleWindowClose);

            this.events.emit("open");
        });

        this.socket.addEventListener("message", (event) => {
            if (typeof event.data === 'string') {
                let message: DGLabMessage;

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

        self.removeEventListener("beforeunload", this.handleWindowClose);

        // Reconnect
        setTimeout(() => {
            this.connect();
        }, reconnectInterval);
    }

    public async sendStrengthChange(strengthA: number, limitA: number, strengthB: number, limitB: number) {
        await this.send({
            type: MessageType.MSG,
            clientId: this.clientId,
            targetId: this.clientId,
            message: `strength-${strengthA}+${strengthB}+${limitA}+${limitB}`,
        });
    }

    public async sendFeedback(btnIndex: number) {
        await this.send({
            type: MessageType.MSG,
            clientId: this.clientId,
            targetId: this.clientId,
            message: `feedback-${btnIndex}`,
        });
    }

    private async handleMessage(message: DGLabMessage): Promise<void> {
        if (import.meta.env.DEV && message?.type !== MessageType.HEARTBEAT) { // 调试输出
            console.log('websocket message', message);
        }

        if (!this.clientId) {
            // 等待绑定模式
            if (message.type !== MessageType.BIND) {
                console.warn("Received message before binding:", message);
                return;
            }

            this.clientId = message.clientId;

            // 发送绑定消息
            await this.send({
                type: MessageType.BIND,
                clientId: this.clientId,
                targetId: this.clientId,
                message: MessageDataHead.DG_LAB,
            })

            return;
        } else {
            if (message.targetId !== this.clientId) {
                console.warn("Received message for another client:", message.targetId, message);
                return;
            }
        }

        switch (message.type) {
            case MessageType.BIND:
                if (message.message !== RetCode.SUCCESS) {
                    console.error("Failed to bind:", message.message);
                    this.events.emit('error', message);
                    return;
                }

                this.events.emit('bind', message.targetId);
                break;
            case MessageType.MSG:
                if (message.message.startsWith('strength-')) { // 设置强度
                    const [channelStr, modeStr, strengthStr] = message.message.split('-')[1].split('+');

                    const channel = channelStr === '1' ? CoyoteChannel.A : CoyoteChannel.B;
                    const mode = parseInt(modeStr) as StrengthChangeMode;
                    const strength = parseInt(strengthStr);

                    this.events.emit('setStrength', channel, mode, strength);
                } else if (message.message.startsWith('pulse-')) { // 设置脉冲
                    const data = message.message.split('-')[1].split(':');
                    const channelStr = data[0];
                    const pulseHexList = JSON.parse(data[1]);

                    const channel = channelStr === 'A' ? CoyoteChannel.A : CoyoteChannel.B;
                    
                    this.events.emit('pulse', channel, pulseHexList);
                } else if (message.message.startsWith('clear-')) { // 清除脉冲
                    const channelStr = message.message.split('-')[1];

                    const channel = channelStr === '1' ? CoyoteChannel.A : CoyoteChannel.B;

                    this.events.emit('clearPulse', channel);
                }
                break;
            case MessageType.BREAK:
                this.events.emit('breakConnection');
                break;
            case MessageType.ERROR:
                console.warn("Received error message:", message.message);
                this.events.emit('error', message);
                break;
            case MessageType.HEARTBEAT:
                // Do nothing
                break;
            default:
                console.warn("Unknown message:", message.type, message);
                break;
        }
    };

    public close() {
        this.shouldClose = true;
        this.socket.close();
        self.removeEventListener('beforeunload', this.handleWindowClose);

        this.events.emit('close');
        this.events.removeAllListeners();
    };
}
