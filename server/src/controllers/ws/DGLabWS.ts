
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { AsyncWebSocket } from '#app/utils/WebSocketAsync.js';
import { Channel, DGLabMessage, MessageDataHead, MessageType, RetCode, FeedbackButton } from '#app/types/dg.js';
import { asleep } from '#app/utils/utils.js';
import { EventStore } from '#app/utils/EventStore.js';
import { DGLabPulseBaseInfo, DGLabPulseInfo, DGLabPulseService } from '#app/services/DGLabPulse.js';
import { createHarvest } from '#app/utils/task.js';
import { ServerContext } from '#app/types/server.js';

const HEARTBEAT_INTERVAL = 20.0;
const HEARTBEAT_TIMEOUT = 20.0;

export interface StrengthInfo {
    strength: number;
    limit: number;
};

export interface OutputPulseOptions {
    abortController?: AbortController;
    bChannel?: boolean;
    customPulseList?: DGLabPulseInfo[];
    onTimeEnd?: () => void;
}

export interface DGLabWSEvents {
    strengthChanged: [strength: StrengthInfo, strength_b: StrengthInfo];
    setStrength: [channel: Channel, strength: number];
    sendPulse: [channel: Channel, pulse: string[]];
    clearPulse: [channel: Channel];
    feedback: [button: FeedbackButton];
    close: [];
};

export class DGLabWSClient {
    private ctx: ServerContext;

    public clientId: string = '';
    public targetId: string = '';
    public strength: StrengthInfo = { strength: 0, limit: 0 };
    public strengthChannelB: StrengthInfo = { strength: 0, limit: 0 };
    public socket: AsyncWebSocket;
    public active: boolean = true;

    private closed = false;

    public pulseList: DGLabPulseBaseInfo[] = [];

    private eventStore = new EventStore();
    private events = new EventEmitter<DGLabWSEvents>();
    private heartbeatTask: NodeJS.Timeout | null = null;

    public constructor(ctx: ServerContext, socket: AsyncWebSocket, client_id: string | null) {
        this.ctx = ctx;
        this.socket = socket;
        this.clientId = client_id || uuidv4();
    }

    public async initialize(): Promise<void> {
        this.bindEvents();

        console.log(`Client connected: ${this.clientId}`);
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
    }

    public async send(messageType: MessageType | string, message: string | number): Promise<boolean> {
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
            return true;
        } catch (error: unknown) {
            if (error instanceof Error) {
                if (error.message === "WebSocket is not open: readyState 3 (CLOSED)") {
                    // 连接断开时不处理
                    this.close();
                    return false;
                }
            }
            console.error("Failed to send message:", error);
            this.close();
            return false;
        }
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
            // console.log("Socket closed");
            this.events.emit("close");
            this.destory();
            this.closed = true;
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

    public async setStrength(channel: Channel, strength: number): Promise<boolean> {
        if (channel === Channel.A) {
            if (strength > this.strength.limit) {
                throw new Error("Strength out of limit");
            }
        } else if (channel === Channel.B) {
            if (strength > this.strengthChannelB.limit) {
                throw new Error("Strength out of limit");
            }
        }

        let ret = await this.send(MessageType.MSG, `${MessageDataHead.STRENGTH}-${channel}+2+${strength}`);

        this.events.emit("setStrength", channel, strength);

        return ret;
    }

    private async sendPulse(channel: Channel, pulse: string[]): Promise<boolean> {
        const pulse_str = JSON.stringify(pulse);

        const channel_id = channel === Channel.A ? "A" : "B";

        let ret = await this.send(MessageType.MSG, `${MessageDataHead.PULSE}-${channel_id}:${pulse_str}`);

        this.events.emit("sendPulse", channel, pulse);

        return ret;
    }

    private async clearPulse(channel: Channel): Promise<boolean> {
        const channel_id = channel === Channel.A ? "1" : "2";

        let ret = await this.send(MessageType.MSG, `${MessageDataHead.CLEAR}-${channel_id}`);

        this.events.emit("clearPulse", channel);

        return ret;
    }

    public async outputPulse(pulseId: string, time: number, options: OutputPulseOptions = {}) {
        // 输出脉冲，直到下次随机强度时间
        let totalDuration = 0;
        const pulseService = DGLabPulseService.instance;
        const currentPulseInfo = pulseService.getPulse(pulseId, options.customPulseList) ?? pulseService.getDefaultPulse();

        let startTime = Date.now();

        let harvest = () => {};
        if (options.abortController) {
            harvest = createHarvest(options.abortController);
        }

        for (let i = 0; i < 50; i++) {
            let [pulseData, pulseDuration] = pulseService.getPulseHexData(currentPulseInfo);

            await this.sendPulse(Channel.A, pulseData);
            if (options.bChannel) {
                await this.sendPulse(Channel.B, pulseData);
            }

            harvest();

            totalDuration += pulseDuration;
            if (totalDuration > time) {
                break;
            }
        }

        let netDuration = Date.now() - startTime;

        await asleep(time, options.abortController); // 等待时间到达

        harvest();
        
        startTime = Date.now();
        options.onTimeEnd?.(); // 时间到达后的回调
        let onTimeEndDuration = Date.now() - startTime;

        let finished = true;
        harvest();

        if (totalDuration > time) {
            const waitTime = totalDuration - time - onTimeEndDuration - netDuration;
            finished = await asleep(waitTime, options.abortController);
        }
    }

    public async reset() {
        await Promise.all([
            this.clearPulse(Channel.A),
            this.clearPulse(Channel.B),
        ]);
    }

    public async close() {
        this.active = false;
        if (this.socket.readyState === WebSocket.OPEN) {
            try {
                await this.send(MessageType.BREAK, RetCode.CLIENT_DISCONNECTED);
            } catch (error) {
                console.error("Failed to send break message:", error);
            }
        }
        this.socket.close();

        if (!this.closed) {
            this.events.emit("close");
            this.destory();
            this.closed = true;
        }
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