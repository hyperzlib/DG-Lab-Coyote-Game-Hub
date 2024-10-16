// This script should be run in WebWorker.

import { CoyoteChannel, DGLabSocketApi, StrengthChangeMode } from "../apis/dgLabSocketApi";
import { hexStringToUint8Array } from "../utils/utils";

class SocketToCoyote3 {
    private socket: DGLabSocketApi | null = null;

    private mainLoopTimer: NodeJS.Timeout | null = null;

    private strengthLimitA = 20;
    private strengthLimitB = 20;

    private strengthA = 0;
    private strengthB = 0;

    private deviceStrengthA = 0;
    private deviceStrengthB = 0;

    private pulseHexListA: string[] = [];
    private pulseHexListB: string[] = [];

    private stopping = false;

    constructor() {
        console.log('SocketToCoyote3 worker started');
        this.bind();
    }

    private bind() {
        self.addEventListener("message", (event) => {
            if (!event.data?.type) {
                return;
            }

            switch (event.data.type) {
                case 'connect':
                    this.connectToWebSocket(event.data.url);
                    break;
                case 'disconnect':
                    this.disconnectFromWebSocket();
                    this.stop();
                    break;
                case 'setStrengthLimit':
                    this.strengthLimitA = event.data.strengthLimitA;
                    this.strengthLimitB = event.data.strengthLimitB;
                    this.sendCurrentStrength();
                    break;
                case 'setStrength':
                    this.deviceStrengthA = event.data.strengthA;
                    this.deviceStrengthB = event.data.strengthB;
                    this.sendCurrentStrength();
                    break;
            }
        });

        self.postMessage({
            type: 'onLoad',
        });
    }

    private connectToWebSocket(url: string) {
        console.log('Connecting to WebSocket:', url);
        this.socket = new DGLabSocketApi(url);
        this.socket.connect();

        this.socket.on('bind', (_: string) => {
            this.sendCurrentStrength();
            this.start();
        });

        this.socket.on('setStrength', (channel: string, mode: number, value: number) => {
            if (channel === CoyoteChannel.A) {
                switch (mode) {
                    case StrengthChangeMode.Sub:
                        this.strengthA = Math.max(0, this.strengthA - value);
                        break;
                    case StrengthChangeMode.Add:
                        this.strengthA = Math.min(this.strengthLimitA, this.strengthA + value);
                        break;
                    case StrengthChangeMode.Set:
                        this.strengthA = Math.max(Math.min(this.strengthLimitA, value), 0);
                        break;
                }
            } else if (channel === CoyoteChannel.B) {
                switch (mode) {
                    case StrengthChangeMode.Sub:
                        this.strengthB = Math.max(0, this.strengthB - value);
                        break;
                    case StrengthChangeMode.Add:
                        this.strengthB = Math.min(this.strengthLimitB, this.strengthB + value);
                        break;
                    case StrengthChangeMode.Set:
                        this.strengthB = Math.max(Math.min(this.strengthLimitB, value), 0);
                        break;
                }
            }
        });

        this.socket.on('pulse', (channel: string, pulseHex: string[]) => {
            if (channel === CoyoteChannel.A) {
                this.pulseHexListA.push(...pulseHex);
            } else if (channel === CoyoteChannel.B) {
                this.pulseHexListB.push(...pulseHex);
            }
        });

        this.socket.on('clearPulse', (channel: string) => {
            if (channel === CoyoteChannel.A) {
                this.pulseHexListA = [];
            } else if (channel === CoyoteChannel.B) {
                this.pulseHexListB = [];
            }
        });

        this.socket.on('breakConnection', () => {
            this.stop();
        });

        this.socket.on('close', () => {
            this.stop();
        });
    }

    private disconnectFromWebSocket() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }

    public async sendCurrentStrength() {
        try {
            await this.socket?.sendStrengthChange(this.deviceStrengthA, this.strengthLimitA, this.deviceStrengthB, this.strengthLimitB);
        } catch (error) {
            console.error('Failed to send current strength:', error);
        }
    }

    private start() {
        this.mainLoopTimer = setInterval(() => {
            this.onTick();
        }, 100);
    }

    private stop() {
        if (this.stopping) {
            return;
        }

        this.stopping = true;

        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }

        if (this.mainLoopTimer) {
            clearInterval(this.mainLoopTimer);
            this.mainLoopTimer = null;
        }

        self.postMessage({
            type: 'stop',
        });
    }

    private onTick() {
        // 波形帧函数，每100ms调用一次
        // 用于向蓝牙设备发送数据
        if (this.pulseHexListA.length + this.pulseHexListB.length === 0) {
            return; // 波形为空则不发送数据
        }

        let strengthA = 0;
        let strengthB = 0;

        let strengthChangedFlag = 0;

        const FLAG_STRENGTH_CHANGED_A = 0b1100;
        const FLAG_STRENGTH_CHANGED_B = 0b0011;

        // 0A0A0A0A00000000 为空白波形
        let pulseHexListA = '0A0A0A0A00000000';
        let pulseHexListB = '0A0A0A0A00000000';

        if (this.deviceStrengthA !== this.strengthA) {
            strengthChangedFlag |= FLAG_STRENGTH_CHANGED_A;
            strengthA = this.strengthA;
        }

        if (this.deviceStrengthB !== this.strengthB) {
            strengthChangedFlag |= FLAG_STRENGTH_CHANGED_B;
            strengthB = this.strengthB;
        }

        if (this.pulseHexListA.length > 0) {
            pulseHexListA = this.pulseHexListA.shift()!;
        }

        if (this.pulseHexListB.length > 0) {
            pulseHexListB = this.pulseHexListB.shift()!;
        }

        let buffer = 'B0';
        
        // 序列号，如果有强度变化则直接定为E
        if (strengthChangedFlag === 0) {
            buffer += '0';
        } else {
            buffer += 'E';
        }

        buffer += strengthChangedFlag.toString(16).substring(0, 1);

        buffer += strengthA.toString(16).padStart(2, '0');
        buffer += strengthB.toString(16).padStart(2, '0');

        buffer += pulseHexListA;
        buffer += pulseHexListB;

        self.postMessage({
            type: 'sendBluetoothData',
            data: {
                '0000150a-0000-1000-8000-00805f9b34fb': hexStringToUint8Array(buffer),
            }
        });
    }
}

new SocketToCoyote3();