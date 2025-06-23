import { CoyoteDeviceVersion } from "../type/common";
import { EventAddListenerFunc, EventRemoveListenerFunc } from "../utils/event";

export type CoyoteLocalConnControllerEventListeners = {
    connect: [],
    workerInit: [],
    disconnect: [],
    reconnecting: [],
    batteryLevelChange: [level: number],
    strengthChange: [strengthA: number, strengthB: number],
    error: [error: Error],
};

export interface CoyoteLocalConnController {
    deviceVersion: CoyoteDeviceVersion;

    on: EventAddListenerFunc<CoyoteLocalConnControllerEventListeners & Record<string, any>>;
    once: EventAddListenerFunc<CoyoteLocalConnControllerEventListeners & Record<string, any>>;
    off: EventRemoveListenerFunc<CoyoteLocalConnControllerEventListeners & Record<string, any>>;

    scan(): Promise<any>;
    connect(): Promise<any>;
    disconnect(): void | Promise<void>;
    startWorker(): void | Promise<void>;
    stopWorker(): void | Promise<void>;
    startWs(): void | Promise<void>;
    setStrengthLimit(strengthLimitA: number, strengthLimitB: number): void | Promise<void>;
    setFreqBalance(freqBalance: number): void | Promise<void>;
    cleanup(): void | Promise<void>;
}