// This script should be run in WebWorker.

import { CoyoteChannel, DGLabSocketApi, StrengthChangeMode } from "../apis/dgLabSocketApi";
import { hexStringToUint8Array } from "../utils/utils";

class SocketToCoyote2 {
    private socket: DGLabSocketApi | null = null;

    private mainLoopTimer: NodeJS.Timeout | null = null;

    private freqBalance = 150;

    private strengthLimitA = 20;
    private strengthLimitB = 20;

    private waveStrengthSeek = 0;

    private strengthA = 0;
    private strengthB = 0;

    private deviceStrengthA = 0;
    private deviceStrengthB = 0;

    private pulseHexListA: string[] = [];
    private pulseHexListB: string[] = [];

    private stopping = false;

    constructor() {
        console.log('SocketToCoyote2 worker started');
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
                case 'setFreqBalance':
                    this.freqBalance = event.data.freqBalance;
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

    private wave3ToWave2(strength: number, freq: number) {
        // const msPerWave = 1000 / freq;
        const X = Math.floor(Math.pow((freq / 1000), 0.5) * (this.freqBalance / 10));
        const Y = Math.floor(freq - X);
        const Z = Math.floor(strength / 5);

        return { X, Y, Z };
    }

    private buildPulsePkg(pulseHex: string) {
        const pulseData = hexStringToUint8Array(pulseHex);
        
        const freq = this.uncompressFreq(pulseData[0]); // 脉冲频率，始终取第一个字节
        const pulseStrength = pulseData[4 + this.waveStrengthSeek]; // 脉冲强度，从第四个字节开始，每4个字节循环播放

        const waveData = this.wave3ToWave2(pulseStrength, freq);

        let tmpBuffer = new Uint32Array([
            (waveData.Z << 15) + (waveData.Y << 5) + waveData.X
        ])

        let pulsePkg = new Uint8Array(tmpBuffer.buffer);
        pulsePkg = pulsePkg.slice(0, 3);

        return pulsePkg;
    }
    
    private uncompressFreq(input: number): number {
        if (input >= 10 && input <= 100) {
            return input;
        } else if (input >= 101 && input <= 600) {
            return (input - 100) / 5 + 100;
        } else if (input >= 601 && input <= 1000) {
            return (input - 600) / 10 + 200;
        } else {
            return 10;
        }
    }

    private onTick() {
        // 波形帧函数，每100ms调用一次
        // 用于向蓝牙设备发送数据
        if (this.pulseHexListA.length + this.pulseHexListB.length === 0) {
            return; // 波形为空则不发送数据
        }

        let pkgList: Record<string, Uint8Array> = {};

        if (this.deviceStrengthA !== this.strengthA || this.deviceStrengthB !== this.strengthB) {
            // 组建强度变化数据包
            let realStrengthA = Math.floor(this.strengthA / 200 * 2047);
            let realStrengthB = Math.floor(this.strengthB / 200 * 2047);
            let setStrengthPkg = new Uint8Array([
                realStrengthA >> 5 & 0xff,
                ((realStrengthA << 3) & 0xff) | ((realStrengthB >> 8) & 0xff),
                realStrengthB & 0xff,
            ]);
            setStrengthPkg.reverse();
            pkgList['955a1504-0fe2-f5aa-a094-84b8d4f3e8ad'] = setStrengthPkg;
        }

        if (this.pulseHexListA.length > 0) {
            const pulseHex = this.pulseHexListA.shift()!;
            pkgList['955a1506-0fe2-f5aa-a094-84b8d4f3e8ad'] = this.buildPulsePkg(pulseHex);
        }

        if (this.pulseHexListB.length > 0) {
            // 组建脉冲数据包
            const pulseHex = this.pulseHexListB.shift()!;
            pkgList['955a1505-0fe2-f5aa-a094-84b8d4f3e8ad'] = this.buildPulsePkg(pulseHex);
        }

        // 增加波形位置偏移
        this.waveStrengthSeek ++;
        if (this.waveStrengthSeek >= 4) {
            this.waveStrengthSeek = 0;
        }

        self.postMessage({
            type: 'sendBluetoothData',
            data: pkgList,
        });
    }
}

new SocketToCoyote2();