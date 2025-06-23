// This script should be run in WebWorker.

import { CoyoteChannel, DGLabSocketApi, StrengthChangeMode } from "../apis/dgLabSocketApi";

class SocketToDebug {
    private socket: DGLabSocketApi | null = null;

    private mainLoopTimer: NodeJS.Timeout | null = null;

    private strengthLimitA = 20;
    private strengthLimitB = 20;

    private strengthA = 0;
    private strengthB = 0;

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
                    this.strengthA = event.data.strengthA;
                    this.strengthB = event.data.strengthB;
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

            self.postMessage({
                type: 'strengthChange',
                data: {
                    strengthA: this.strengthA,
                    strengthB: this.strengthB,
                }
            });

            this.sendCurrentStrength();
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
            await this.socket?.sendStrengthChange(this.strengthA, this.strengthLimitA, this.strengthB, this.strengthLimitB);
        } catch (error) {
            console.error('Failed to send current strength:', error);
        }
    }

    private start() {
        
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
}

new SocketToDebug();