import { v4 as uuidv4 } from 'uuid';
import { Channel, MessageDataHead, MessageType, RetCode } from '../../types/dg';
import { asleep } from '../../utils/utils';
import { EventEmitter } from 'koa';
import { EventStore } from '../../utils/EventStore';
const HEARTBEAT_INTERVAL = 20.0;
const HEARTBEAT_TIMEOUT = 20.0;
;
export class DGLabWSClient {
    clientId = '';
    targetId = '';
    strength = { strength: 0, limit: 0 };
    strengthChannelB = { strength: 0, limit: 0 };
    socket;
    eventStore = new EventStore();
    eventEmitter = new EventEmitter();
    heartbeatTask = null;
    constructor(socket, client_id) {
        this.socket = socket;
        this.clientId = client_id || uuidv4();
    }
    async initialize() {
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
        this.heartbeatTask = setInterval(() => this.runHeartbeatTask(), HEARTBEAT_INTERVAL * 1000);
    }
    async send(messageType, message) {
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
    async runHeartbeatTask() {
        await this.send(MessageType.HEARTBEAT, RetCode.SUCCESS);
    }
    bindEvents() {
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
    async handleMessage(message) {
        if (message.type === MessageType.BIND) {
            if (message.message === MessageDataHead.DG_LAB) {
                this.targetId = message.targetId;
                console.log(`Bind success: ${this.clientId} -> ${this.targetId}`);
                await this.send(MessageType.BIND, RetCode.SUCCESS);
            }
            else {
                console.log(`Bind failed: ${message.message}`);
            }
        }
        else if (message.type === MessageType.MSG) {
            if (message.message.startsWith("feedback-")) {
                await this.handleMsgFeedback(message.message);
            }
            else if (message.message.startsWith("strength-")) {
                await this.handleMsgStrengthChanged(message.message);
            }
        }
        else if (message.type === MessageType.HEARTBEAT) {
            if (message.message === MessageDataHead.DG_LAB) {
                console.log(`Heartbeat success`);
            }
            else {
                console.log(`Heartbeat failed: ${message.message}`);
            }
        }
        else if (message.type === MessageType.BREAK) {
            if (message.message === RetCode.CLIENT_DISCONNECTED) {
                console.log(`Client disconnected: ${message.clientId}`);
            }
            else {
                console.log(`Break failed: ${message.message}`);
            }
        }
    }
    async handleMsgStrengthChanged(message) {
        const strengthData = message.split("-")[1].split("+");
        this.strength = {
            strength: parseInt(strengthData[0]),
            limit: parseInt(strengthData[2]),
        };
        this.strengthChannelB = {
            strength: parseInt(strengthData[1]),
            limit: parseInt(strengthData[3]),
        };
        console.log(`Current strength: ${this.strength.strength}/${this.strength.limit}, ${this.strengthChannelB.strength}/${this.strengthChannelB.limit}`);
        this.eventEmitter.emit("strengthChanged", this.strength, this.strengthChannelB);
    }
    async handleMsgFeedback(message) {
        console.log(`Feedback: ${message}`);
        const button = parseInt(message.split("-")[1]);
        this.eventEmitter.emit("feedback", button);
    }
    async setStrength(channel, strength) {
        if (channel === Channel.A) {
            if (strength > this.strength.limit) {
                throw new Error("Strength out of limit");
            }
        }
        else if (channel === Channel.B) {
            if (strength > this.strengthChannelB.limit) {
                throw new Error("Strength out of limit");
            }
        }
        await this.send(MessageType.MSG, `${MessageDataHead.STRENGTH}-${channel}+2+${strength}`);
        this.eventEmitter.emit("setStrength", channel, strength);
    }
    async sendPulse(channel, pulse) {
        const pulse_str = JSON.stringify(pulse);
        const channel_id = channel === Channel.A ? "A" : "B";
        await this.send(MessageType.MSG, `${MessageDataHead.PULSE}-${channel_id}:${pulse_str}`);
        this.eventEmitter.emit("sendPulse", channel, pulse);
    }
    async clearPulse(channel) {
        const channel_id = channel === Channel.A ? "1" : "2";
        await this.send(MessageType.MSG, `${MessageDataHead.CLEAR}-${channel_id}`);
        this.eventEmitter.emit("clearPulse", channel);
    }
    on = this.eventEmitter.on.bind(this.eventEmitter);
    once = this.eventEmitter.once.bind(this.eventEmitter);
    off = this.eventEmitter.off.bind(this.eventEmitter);
    async close() {
        try {
            await this.send(MessageType.BREAK, RetCode.CLIENT_DISCONNECTED);
        }
        catch (error) {
            console.error("Failed to send break message:", error);
        }
        this.socket.close();
    }
    destory() {
        if (this.heartbeatTask) {
            clearInterval(this.heartbeatTask);
        }
        this.eventStore.removeAllListeners();
        this.eventEmitter.removeAllListeners();
    }
}
