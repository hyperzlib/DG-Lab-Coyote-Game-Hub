import { defineStore } from 'pinia'
import { CoyoteBluetoothController } from '../utils/CoyoteBluetoothController';
import { CoyoteDeviceVersion } from '../type/common';

export const useCoyoteBTStore = defineStore('coyoteBTStore', {
    state: () => ({
        connected: false,

        deviceVersion: CoyoteDeviceVersion.V3,

        deviceBattery: 100,
        deviceStrengthA: 0,
        deviceStrengthB: 0,

        freqBalance: 150,
        inputLimitA: 20,
        inputLimitB: 20,

        controller: null as null | CoyoteBluetoothController,
    }),
    actions: {
        initConnection() {
            if (!this.controller) {
                return;
            }

            this.deviceVersion = this.controller.deviceVersion;

            this.connected = true;
            window.onbeforeunload = (event) => {
              event.preventDefault();
              return '确定要断开蓝牙连接吗？';
            };

            this.controller.on('workerInit', () => {
                // 恢复设置
                this.controller?.setStrengthLimit(this.inputLimitA, this.inputLimitB);
                this.controller?.setFreqBalance(this.freqBalance);
                // 启动蓝牙
                this.controller?.startWs();
            });

            this.controller.on('batteryLevelChange', (battery) => {
                this.deviceBattery = battery;
            });

            this.controller.on('strengthChange', (strengthA, strengthB) => {
                this.deviceStrengthA = strengthA;
                this.deviceStrengthB = strengthB;
            });

            this.controller.on('disconnect', () => {
                this.connected = false;
                window.onbeforeunload = null;
            });
        },
        disconnect() {
            this.controller?.cleanup();
            this.controller = null;
            this.connected = false;

            window.onbeforeunload = null;
        },
    },
    persist: {
        key: 'CoyoteBTStore',
        pick: ['freqBalance', 'inputLimitA', 'inputLimitB'],
    }
});