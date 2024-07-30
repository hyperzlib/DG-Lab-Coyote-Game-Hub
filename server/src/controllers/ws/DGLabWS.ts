
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';
import { AsyncWebSocket } from '../../utils/WebSocketAsync';
import { Channel, DGLabMessage, MessageDataHead, MessageType, RetCode, FeedbackButton } from '../../types/dg';
import { asleep } from '../../utils/utils';
import { EventEmitter } from 'events';
import { EventStore } from '../../utils/EventStore';
import { DGLabPulseBaseInfo, DGLabPulseService } from '../../services/DGLabPulse';

const HEARTBEAT_INTERVAL = 20.0;
const HEARTBEAT_TIMEOUT = 20.0;

export interface StrengthInfo {
    strength: number;
    limit: number;
};

export interface OutputPulseOptions {
    abortController?: AbortController;
    bChannel?: boolean;
}

export interface DGLabWSEvents {
    pulseListUpdated: [pulseList: DGLabPulseBaseInfo[]];
    strengthChanged: [strength: StrengthInfo, strength_b: StrengthInfo];
    setStrength: [channel: Channel, strength: number];
    sendPulse: [channel: Channel, pulse: string[]];
    clearPulse: [channel: Channel];
    feedback: [button: FeedbackButton];
    close: [];
};

export class DGLabWSClient {
    public clientId: string = '';
    public targetId: string = '';
    public strength: StrengthInfo = { strength: 0, limit: 0 };
    public strengthChannelB: StrengthInfo = { strength: 0, limit: 0 };
    public socket: AsyncWebSocket;

    public pulseList: DGLabPulseBaseInfo[] = [];

    private eventStore = new EventStore();
    private events = new EventEmitter<DGLabWSEvents>();
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

        await this.reset();
        await new Promise((resolve) => setTimeout(resolve, 500));

        this.heartbeatTask = setInterval(
            () => this.runHeartbeatTask(),
            HEARTBEAT_INTERVAL * 1000
        );

        const pulseService = DGLabPulseService.instance;
        this.pulseList = pulseService.pulseList;
        this.events.emit("pulseListUpdated", this.pulseList);
    }

    public async send(messageType: MessageType | string, message: string | number): Promise<void> {
        // if (messageType !== MessageType.HEARTBEAT) {
        //     console.log("send:", {
        //         type: messageType,
        //         clientId: this.clientId,
        //         targetId: this.targetId,
        //         message: message,
        //     });
        // }

        const jsonStr = JSON.stringify({
            type: messageType,
            clientId: this.clientId,
            targetId: this.targetId,
            message: message,
        });
        
        try {
            await this.socket.sendAsync(jsonStr);
        } catch (error) {
            console.error("Failed to send message:", error);
            this.close();
        }
    }

    public async runHeartbeatTask(): Promise<void> {
        await this.send(MessageType.HEARTBEAT, RetCode.SUCCESS);
    }

    public bindEvents() {
        const socketEvents = this.eventStore.wrap(this.socket);
        const pulseServiceEvents = this.eventStore.wrap(DGLabPulseService.instance);

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
            // console.log("Socket closed");
            this.events.emit("close");

            this.destory();
        });

        pulseServiceEvents.on('pulseListUpdated', (pulseList) => {
            this.pulseList = pulseList;
            this.events.emit("pulseListUpdated", pulseList);
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
                // console.log(`Heartbeat success`);
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

        // console.log(
        //     `Current strength: ${this.strength.strength}/${this.strength.limit}, ${this.strengthChannelB.strength}/${this.strengthChannelB.limit}`
        // );

        this.events.emit("strengthChanged", this.strength, this.strengthChannelB);
    }

    private async handleMsgFeedback(message: string): Promise<void> {
        // console.log(`Feedback: ${message}`);

        const button = parseInt(message.split("-")[1]);

        this.events.emit("feedback", button);
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

        this.events.emit("setStrength", channel, strength);
    }

    private async sendPulse(channel: Channel, pulse: string[]): Promise<void> {
        const pulse_str = JSON.stringify(pulse);

        const channel_id = channel === Channel.A ? "A" : "B";

        await this.send(MessageType.MSG, `${MessageDataHead.PULSE}-${channel_id}:${pulse_str}`);

        this.events.emit("sendPulse", channel, pulse);
    }

    private async clearPulse(channel: Channel): Promise<void> {
        const channel_id = channel === Channel.A ? "1" : "2";

        await this.send(MessageType.MSG, `${MessageDataHead.CLEAR}-${channel_id}`);

        this.events.emit("clearPulse", channel);
    }

    public async outputPulse(pulseId: string, time: number, options: OutputPulseOptions = {}) {
        // 输出脉冲，直到下次随机强度时间
        let totalDuration = 0;
        const pulseService = DGLabPulseService.instance;
        const currentPulseInfo = pulseService.getPulse(pulseId) ?? pulseService.getDefaultPulse();

        let startTime = Date.now();

        for (let i = 0; i < 50; i++) {
            let [pulseData, pulseDuration] = pulseService.buildPulse(currentPulseInfo);

            await this.sendPulse(Channel.A, pulseData);
            if (options.bChannel) {
                await this.sendPulse(Channel.B, pulseData);
            }

            totalDuration += pulseDuration;
            if (totalDuration > time) {
                break;
            }
        }

        let netDuration = Date.now() - startTime;

        let finished = true;
        if (totalDuration < time) {
            finished = await asleep(time - totalDuration - netDuration, options.abortController);
        } else {
            finished = await asleep(totalDuration + 200 - netDuration, options.abortController);
        }

        if (!finished) {
            await this.clearPulse(Channel.A);
            if (options.bChannel) {
                await this.clearPulse(Channel.B);
            }
        }
    }

    public async reset() {
        await this.clearPulse(Channel.A);
        await this.clearPulse(Channel.B);
    }

    public async close() {
        if (this.socket.readyState === WebSocket.OPEN) {
            try {
                await this.send(MessageType.BREAK, RetCode.CLIENT_DISCONNECTED);
            } catch (error) {
                console.error("Failed to send break message:", error);
            }
        }
        this.socket.close();
    }

    public destory() {
        if (this.heartbeatTask) {
            clearInterval(this.heartbeatTask);
        }

        this.eventStore.removeAllListeners();
        this.events.removeAllListeners();
    }

    public on = this.events.on.bind(this.events);
    public once = this.events.once.bind(this.events);
    public off = this.events.off.bind(this.events);
    public removeAllListeners = this.events.removeAllListeners.bind(this.events);
}