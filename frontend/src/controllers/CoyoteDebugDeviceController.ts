import { EventEmitter } from "eventemitter3";
import { CoyoteDeviceVersion } from "../type/common";
import { EventAddListenerFunc, EventRemoveListenerFunc } from "../utils/event";
import { CoyoteLocalConnController, CoyoteLocalConnControllerEventListeners } from "./CoyoteLocalConnController";
import SocketToDebug from '../workers/SocketToDebug?worker';

export class CoyoteDebugDeviceController implements CoyoteLocalConnController {
    deviceVersion: CoyoteDeviceVersion = CoyoteDeviceVersion.SIMULATOR;
    
    private events = new EventEmitter();
    private stopping = false;
    private worker: Worker | null = null;
    private clientId: string;

    public constructor(clientId: string) {
        this.clientId = clientId;
    }

    public on: EventAddListenerFunc<CoyoteLocalConnControllerEventListeners> = this.events.on.bind(this.events);
    public once: EventAddListenerFunc<CoyoteLocalConnControllerEventListeners> = this.events.once.bind(this.events);
    public off: EventRemoveListenerFunc<CoyoteLocalConnControllerEventListeners> = this.events.off.bind(this.events);

    public async scan(): Promise<any> {
        throw new Error("Method not implemented.");
    }

    public async connect(): Promise<any> {
        await Notification.requestPermission();

        this.events.emit('connect');

        
        this.events.emit('batteryLevelChange', 100); // Simulate battery level change

        // Start worker
        this.startWorker();
    }

    public async disconnect(): Promise<void> {
        this.stopWorker();
        this.events.emit("disconnect");
    }

    public startWorker() {
        if (this.worker === null) {
            this.worker = new SocketToDebug();
            this.bindWorkerEvents();
        } else {
            this.worker.postMessage({ type: 'reconnect' });
        }
    }

    public stopWorker() {
        if (this.worker) {
            const currentWorker = this.worker;
            this.worker = null;
            
            currentWorker.postMessage({ type: 'disconnect' });
            setTimeout(() => {
                currentWorker.terminate();
            }, 3000);
        }
    }
    
    public bindWorkerEvents() {
        if (this.worker) {
            this.worker.addEventListener('message', (event) => {
                if (event.data) {
                    this.handleWorkerMessage(event.data);
                }
            });
        }
    }
    
    private handleWorkerMessage = async (message: any) => {
        if (!message.type) {
            console.error('Unknown message type');
            return;
        }

        switch (message.type) {
            case 'onLoad':
                // 连接到WebSocket
                this.events.emit('workerInit');
                break;
            case 'strengthChange':
                new Notification(`强度变化 A: ${message.data?.strengthA}, B: ${message.data?.strengthB}`, {
                    tag: 'coyoteDebugStrengthChanged',
                });
                this.events.emit('strengthChange', message.data?.strengthA ?? 0, message.data?.strengthB ?? 0);
                break;
            case 'stop':
                // 断开连接
                if (!this.stopping) {
                    this.cleanup();
                }
                break;
            default:
                console.error('Unknown message type', message);
                break;
        }
    }

    startWs(): void {
        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        const wsUrl = `${protocol}://${window.location.host}/dglab_ws/${this.clientId}`;
        this.worker?.postMessage({
            type: 'connect',
            url: wsUrl,
        });
    }

    public setStrengthLimit(strengthLimitA: number, strengthLimitB: number) {
        this.worker?.postMessage({
            type: 'setStrengthLimit',
            strengthLimitA,
            strengthLimitB,
        });
    }

    public setFreqBalance(freqBalance: number) {
        this.worker?.postMessage({
            type: 'setFreqBalance',
            freqBalance,
        });
    }
    
    public async cleanup(): Promise<void> {
        this.stopping = true;
        await this.disconnect();
    }

}