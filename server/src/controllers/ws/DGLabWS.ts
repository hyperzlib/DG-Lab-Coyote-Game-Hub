
import { v4 as uuidv4 } from 'uuid';
import { AsyncWebSocket } from '../../utils/WebSocketAsync';
import { Channel, DGLabMessage, MessageDataHead, MessageType, RetCode, FeedbackButton } from '../../types/dg';
import { asleep } from '../../utils/utils';
import { EventEmitter } from 'koa';
import { EventStore } from '../../utils/EventStore';

const HEARTBEAT_INTERVAL = 20.0;
const HEARTBEAT_TIMEOUT = 20.0;

export interface StrengthInfo {
    strength: number;
    limit: number;
};

export type DGLabWSEvents = {
    (name: 'strengthChanged', listener: (strength: StrengthInfo, strength_b: StrengthInfo) => void): void;
    (name: 'setStrength', listener: (channel: Channel, strength: number) => void): void;
    (name: 'sendPulse', listener: (channel: Channel, pulse: string[]) => void): void;
    (name: 'clearPulse', listener: (channel: Channel) => void): void;
    (name: 'feedback', listener: (button: FeedbackButton) => void): void;
    (name: 'close', listener: () => void): void;
};

export class DGLabWSClient {
    public clientId: string = '';
    public targetId: string = '';
    public strength: StrengthInfo = { strength: 0, limit: 0 };
    public strengthChannelB: StrengthInfo = { strength: 0, limit: 0 };
    public socket: AsyncWebSocket;

    private eventStore = new EventStore();
    private eventEmitter = new EventEmitter();
    private heartbeatTask: NodeJS.Timeout | null = null;

    public constructor(socket: AsyncWebSocket, client_id: string | null) {
        this.socket = socket;
        this.clientId = client_id || uuidv4();
    }

    public async initialize(): Promise<void> {
        this.bindEvents();

        await this.send(MessageType.BIND, MessageDataHead.TARGET_ID);

        // Wait for successful binding
        const start_time = Date.now();
        while (!this.targetId) {
            await asleep(500);
            if (Date.now() - start_time > HEARTBEAT_TIMEOUT * 1000) {
                await this.send(MessageType.BREAK, RetCode.SERVER_DELAY);
                this.socket.close();
                throw new Error("Bind timeout");
            }
        }

        await this.clearPulse(Channel.A);
        await this.clearPulse(Channel.B);
        await new Promise((resolve) => setTimeout(resolve, 500));

        this.heartbeatTask = setInterval(
            () => this.runHeartbeatTask(),
            HEARTBEAT_INTERVAL * 1000
        );
    }

    public async send(messageType: MessageType | string, message: string | number): Promise<void> {
        if (messageType !== MessageType.HEARTBEAT) {
            console.log("send:", {
                type: messageType,
                clientId: this.clientId,
                targetId: this.targetId,
                message: message,
            });
        }

        const jsonStr = JSON.stringify({
            type: messageType,
            clientId: this.clientId,
            targetId: this.targetId,
            message: message,
        });
        
        await this.socket.sendAsync(jsonStr);
    }

    public async runHeartbeatTask(): Promise<void> {
        await this.send(MessageType.HEARTBEAT, RetCode.SUCCESS);
    }

    public bindEvents() {
        const socketEvents = this.eventStore.wrap(this.socket);

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
            console.log("Socket closed");
            this.eventEmitter.emit("close");

            this.destory();
        });
    }

    private async handleMessage(message: DGLabMessage): Promise<void> {
        if (message.type === MessageType.BIND) {
            if (message.message === MessageDataHead.DG_LAB) {
                this.targetId = message.targetId;
                console.log(`Bind success: ${this.clientId} -> ${this.targetId}`);
                await this.send(MessageType.BIND, RetCode.SUCCESS);
            } else {
                console.log(`Bind failed: ${message.message}`);
            }
        } else if (message.type === MessageType.MSG) {
            if (message.message.startsWith("feedback-")) {
                await this.handleMsgFeedback(message.message);
            } else if (message.message.startsWith("strength-")) {
                await this.handleMsgStrengthChanged(message.message);
            }
        } else if (message.type === MessageType.HEARTBEAT) {
            if (message.message === MessageDataHead.DG_LAB) {
                console.log(`Heartbeat success`);
            } else {
                console.log(`Heartbeat failed: ${message.message}`);
            }
        } else if (message.type === MessageType.BREAK) {
            if (message.message === RetCode.CLIENT_DISCONNECTED) {
                console.log(`Client disconnected: ${message.clientId}`);
            } else {
                console.log(`Break failed: ${message.message}`);
            }
        }
    }

    private async handleMsgStrengthChanged(message: string): Promise<void> {
        const strengthData = message.split("-")[1].split("+");

        this.strength = {
            strength: parseInt(strengthData[0]),
            limit: parseInt(strengthData[2]),
        };
        this.strengthChannelB = {
            strength: parseInt(strengthData[1]),
            limit: parseInt(strengthData[3]),
        };

        console.log(
            `Current strength: ${this.strength.strength}/${this.strength.limit}, ${this.strengthChannelB.strength}/${this.strengthChannelB.limit}`
        );

        this.eventEmitter.emit("strengthChanged", this.strength, this.strengthChannelB);
    }

    private async handleMsgFeedback(message: string): Promise<void> {
        console.log(`Feedback: ${message}`);

        const button = parseInt(message.split("-")[1]);

        this.eventEmitter.emit("feedback", button);
    }

    public async setStrength(channel: Channel, strength: number): Promise<void> {
        if (channel === Channel.A) {
            if (strength > this.strength.limit) {
                throw new Error("Strength out of limit");
            }
        } else if (channel === Channel.B) {
            if (strength > this.strengthChannelB.limit) {
                throw new Error("Strength out of limit");
            }
        }

        await this.send(MessageType.MSG, `${MessageDataHead.STRENGTH}-${channel}+2+${strength}`);

        this.eventEmitter.emit("setStrength", channel, strength);
    }

    public async sendPulse(channel: Channel, pulse: string[]): Promise<void> {
        const pulse_str = JSON.stringify(pulse);

        const channel_id = channel === Channel.A ? "A" : "B";

        await this.send(MessageType.MSG, `${MessageDataHead.PULSE}-${channel_id}:${pulse_str}`);

        this.eventEmitter.emit("sendPulse", channel, pulse);
    }

    public async clearPulse(channel: Channel): Promise<void> {
        const channel_id = channel === Channel.A ? "1" : "2";

        await this.send(MessageType.MSG, `${MessageDataHead.CLEAR}-${channel_id}`);

        this.eventEmitter.emit("clearPulse", channel);
    }

    public on: DGLabWSEvents = this.eventEmitter.on.bind(this.eventEmitter);
    public once: DGLabWSEvents = this.eventEmitter.once.bind(this.eventEmitter);
    public off = this.eventEmitter.off.bind(this.eventEmitter);

    public async close() {
        try {
            await this.send(MessageType.BREAK, RetCode.CLIENT_DISCONNECTED);
        } catch (error) {
            console.error("Failed to send break message:", error);
        }
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