import { EventEmitter } from "eventemitter3";
import { CoyoteDeviceVersion } from "../type/common";

import SocketToCoyote3Worker from '../workers/SocketToCoyote3?worker';
import SocketToCoyote2Worker from '../workers/SocketToCoyote2?worker';

import { EventAddListenerFunc, EventRemoveListenerFunc } from "./event";

/** 设备扫描前缀 */
export const devicePrefixMap = {
    [CoyoteDeviceVersion.V2]: 'D-LAB',
    [CoyoteDeviceVersion.V3]: '47',
}

/** 蓝牙服务ID */
export const serviceIdMap = {
    [CoyoteDeviceVersion.V2]: {
        main: '955a180b-0fe2-f5aa-a094-84b8d4f3e8ad',
        battery: '955a180a-0fe2-f5aa-a094-84b8d4f3e8ad',
    },
    [CoyoteDeviceVersion.V3]: {
        main: '0000180c-0000-1000-8000-00805f9b34fb',
        battery: '0000180a-0000-1000-8000-00805f9b34fb',
    },
};

export type CoyoteBluetoothControllerEventListeners = {
    connect: [],
    disconnect: [],
    batteryLevelChange: [level: number],
    strengthChange: [strengthA: number, strengthB: number],
    error: [error: Error],
};

export class CoyoteBluetoothController {
    public deviceVersion: CoyoteDeviceVersion = CoyoteDeviceVersion.V3;
    public clientId: string = '';

    private events = new EventEmitter();

    private stopping: boolean = false;

    public device: BluetoothDevice | null = null;
    public gattServer: BluetoothRemoteGATTServer | null = null;
    public mainService: BluetoothRemoteGATTService | null = null;
    public batteryService: BluetoothRemoteGATTService | null = null;

    private batteryTask: NodeJS.Timeout | null = null;

    private characteristics: Map<string, BluetoothRemoteGATTCharacteristic> = new Map();

    public worker: Worker | null = null;

    constructor(deviceVersion: CoyoteDeviceVersion, clientId: string) {
        this.deviceVersion = deviceVersion;
        this.clientId = clientId;
    }

    public on: EventAddListenerFunc<CoyoteBluetoothControllerEventListeners> = this.events.on.bind(this.events);
    public once: EventAddListenerFunc<CoyoteBluetoothControllerEventListeners> = this.events.once.bind(this.events);
    public off: EventRemoveListenerFunc<CoyoteBluetoothControllerEventListeners> = this.events.off.bind(this.events);

    public async scan() {
        if (!('bluetooth' in navigator)) {
            this.events.emit('error', new Error('Bluetooth is not supported'));
            return;
        }

        const devicePrefix = devicePrefixMap[this.deviceVersion];
        const serviceIds = [
            serviceIdMap[this.deviceVersion].main,
            serviceIdMap[this.deviceVersion].battery,
        ];

        this.device = await navigator.bluetooth.requestDevice({
            filters: [{
                namePrefix: devicePrefix
            }],
            optionalServices: serviceIds
        });
    }

    public async connect() {
        if (!this.device) {
            throw new Error('No device');
        }

        this.device.addEventListener('gattserverdisconnected', this.handleDisconnected);
        
        if (!this.device.gatt) {
            this.events.emit('error', new Error('Failed to get GATT server'));
            return;
        }

        if (!this.device.gatt.connected) {
            await this.device.gatt.connect();
        }

        try {
            this.gattServer = this.device.gatt;

            const mainServiceId = serviceIdMap[this.deviceVersion].main;
            this.mainService = await this.gattServer.getPrimaryService(mainServiceId);

            const batteryServiceId = serviceIdMap[this.deviceVersion].battery;
            this.batteryService = await this.gattServer.getPrimaryService(batteryServiceId);

            await this.addBTLisener();

            this.events.emit('connect');

            // Start worker
            this.startWorker();

            this.batteryTask = setInterval(this.runBatteryTask, 120 * 1000);
        } catch (error) {
            this.disconnect();
            throw error;
        }
    }

    private async addBTLisener() {
        if (this.deviceVersion === CoyoteDeviceVersion.V3) {
            // 监听上报消息
            const responseCharacteristic = await this.mainService!.getCharacteristic('0000150b-0000-1000-8000-00805f9b34fb');
            this.characteristics.set('0000150b-0000-1000-8000-00805f9b34fb', responseCharacteristic);
            await responseCharacteristic.startNotifications();
            responseCharacteristic.addEventListener('characteristicvaluechanged', this.handleBTResponse);

            // 监听电量变化
            const batteryCharacteristic = await this.batteryService!.getCharacteristic('00001500-0000-1000-8000-00805f9b34fb');
            this.characteristics.set('00001500-0000-1000-8000-00805f9b34fb', batteryCharacteristic);
            const currentBatteryLevel = await batteryCharacteristic.readValue();
            const currentBatteryLevelValue = currentBatteryLevel.getUint8(0);
            this.events.emit('batteryLevelChange', currentBatteryLevelValue);

            // 缓存写入特征
            const writeCharacteristics = await this.mainService!.getCharacteristic('0000150a-0000-1000-8000-00805f9b34fb');
            this.characteristics.set('0000150a-0000-1000-8000-00805f9b34fb', writeCharacteristics);
        } else if (this.deviceVersion === CoyoteDeviceVersion.V2) {
            console.log('V2');
            // 监听上报消息
            const responseCharacteristic = await this.mainService!.getCharacteristic('955a1504-0fe2-f5aa-a094-84b8d4f3e8ad');
            this.characteristics.set('955a1504-0fe2-f5aa-a094-84b8d4f3e8ad', responseCharacteristic);
            await responseCharacteristic.startNotifications();
            responseCharacteristic.addEventListener('characteristicvaluechanged', this.handleBTResponse);

            // 监听电量变化
            const batteryCharacteristic = await this.batteryService!.getCharacteristic('955a1500-0fe2-f5aa-a094-84b8d4f3e8ad');
            this.characteristics.set('955a1500-0fe2-f5aa-a094-84b8d4f3e8ad', batteryCharacteristic);
            const currentBatteryLevel = await batteryCharacteristic.readValue();
            const currentBatteryLevelValue = currentBatteryLevel.getUint8(0);
            this.events.emit('batteryLevelChange', currentBatteryLevelValue);

            // 缓存写入特征
            const aChannelCharacteristic = await this.mainService!.getCharacteristic('955a1505-0fe2-f5aa-a094-84b8d4f3e8ad');
            this.characteristics.set('955a1505-0fe2-f5aa-a094-84b8d4f3e8ad', aChannelCharacteristic);

            const bChannelCharacteristic = await this.mainService!.getCharacteristic('955a1506-0fe2-f5aa-a094-84b8d4f3e8ad');
            this.characteristics.set('955a1506-0fe2-f5aa-a094-84b8d4f3e8ad', bChannelCharacteristic);
        }
    }

    public disconnect() {
        this.stopping = true;
        
        if (this.device) {
            this.device.removeEventListener('gattserverdisconnected', this.handleDisconnected);
            this.device.gatt?.disconnect();
        }

        if (this.worker) {
            this.stopWorker();
        }

        if (this.batteryTask) {
            clearInterval(this.batteryTask);
            this.batteryTask = null;
        }

        this.device = null;
        this.gattServer = null;
        this.mainService = null;
        this.batteryService = null;
        this.characteristics.clear();

        this.events.emit('disconnect');
    }

    private handleDisconnected = () => {
        this.disconnect();

        // 尝试重新连接
        this.connect();
    }

    public startWorker() {
        if (this.worker === null) {
            switch (this.deviceVersion) {
                case CoyoteDeviceVersion.V3:
                    this.worker = new SocketToCoyote3Worker();
                    break;
                case CoyoteDeviceVersion.V2:
                    this.worker = new SocketToCoyote2Worker();
                    break;
                default:
                    console.error('Unknown device version');
                    break;
            }
            this.bindWorkerEvents();
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

    private async sendBluetoothData(characteristicId: string, buffer: Uint8Array) {
        const characteristic = this.characteristics.get(characteristicId);
        if (!characteristic) {
            console.error('No characteristic: ', characteristicId);
            return;
        }

        await characteristic.writeValueWithoutResponse(buffer);
    }

    private handleBTResponse = async (event: Event) => {
        const target = event.target as BluetoothRemoteGATTCharacteristic;
        const value = target.value;
        if (!value) {
            return;
        }

        if (value.byteLength === 0) {
            return;
        }

        if (this.deviceVersion === CoyoteDeviceVersion.V3) {
            const pkgId = value.getUint8(0);
            switch (pkgId) {
                case 0xb1: // 强度上报
                    // const resId = value.getUint8(1);
                    const strengthA = value.getInt8(2);
                    const strengthB = value.getInt8(3);

                    this.events.emit('strengthChange', strengthA, strengthB);
                    
                    this.worker?.postMessage({
                        type: 'setStrength',
                        strengthA,
                        strengthB,
                    });
                    break;
            }
        } else if (this.deviceVersion === CoyoteDeviceVersion.V2) {
            const buffer = new Uint8Array(value.buffer);
            buffer.reverse();
            let strengthA = ((buffer[0] & 0b00111111) << 5) | ((buffer[1] & 0b11111000) >> 3);
            let strengthB = ((buffer[1] & 0b00000111) << 8) | buffer[2];
            strengthA = Math.ceil(strengthA / 2047 * 200);
            strengthB = Math.ceil(strengthB / 2047 * 200);

            console.log('强度上报包: ', buffer);

            this.events.emit('strengthChange', strengthA, strengthB);

            this.worker?.postMessage({
                type: 'setStrength',
                strengthA,
                strengthB,
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
                const protocol = window.location.protocol === "https:" ? "wss" : "ws";
                const wsUrl = `${protocol}://${window.location.host}/dglab_ws/${this.clientId}`;
                this.worker?.postMessage({
                    type: 'connect',
                    url: wsUrl,
                });
                break;
            case 'sendBluetoothData':
                if (!this.gattServer) {
                    console.error('No GATT server');
                    return;
                }

                if (!this.mainService) {
                    console.error('No mainService');
                    return;
                }

                try {
                    const dataMap = message.data;
                    let tasks: Promise<void>[] = [];

                    console.log('发送数据: ', dataMap);

                    // 将数据发送到蓝牙设备
                    for (let key in dataMap) {
                        const data = dataMap[key];
                        tasks.push(this.sendBluetoothData(key, data));
                    }

                    await Promise.all(tasks);
                } catch (error) {
                    console.error('波形写入异常: ', error);
                }
                break;
            case 'stop':
                // 断开连接
                if (!this.stopping) {
                    this.cleanup();
                }
                break;
            default:
                console.error('Unknown message type');
                break;
        }
    }

    private runBatteryTask = async () => {
        if (!this.batteryService) {
            return;
        }

        try {
            const batteryCharacteristic = this.characteristics.get('00001500-0000-1000-8000-00805f9b34fb');
            if (!batteryCharacteristic) {
                return;
            }

            const value = await batteryCharacteristic.readValue();
            const batteryLevel = value.getUint8(0);
            this.events.emit('batteryLevelChange', batteryLevel);
        } catch (error) {
            console.error('获取电量异常: ', error);
        }
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

    public cleanup() {
        this.stopping = true;
        this.disconnect();
        this.events.removeAllListeners();
    }
}