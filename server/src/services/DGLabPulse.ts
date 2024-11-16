import * as fs from 'fs';
import * as path from 'path';
import JSON5 from 'json5';
import { v4 as uuid4 } from 'uuid';
import { EventEmitter } from 'events';
import { ReactiveConfig } from '@hyperzlib/node-reactive-config';

ReactiveConfig.addParser('json5', {
    parse: JSON5.parse,
    stringify: (value) => JSON5.stringify(value, null, 4),
});

export interface DGLabPulseBaseInfo {
    id: string;
    name: string;
}

export interface DGLabPulseInfo extends DGLabPulseBaseInfo {
    pulseData: string[];
}

export interface DGLabPulseServiceEvents {
    pulseListUpdated: [pulseList: DGLabPulseBaseInfo[]];
}

export const PULSE_WINDOW = 100;

export class DGLabPulseService {
    public pulseList: DGLabPulseInfo[] = [];
    private pulseConfig: ReactiveConfig<DGLabPulseInfo[]>;

    private pulseConfigPath = 'data/pulse.json5';

    private events = new EventEmitter<DGLabPulseServiceEvents>();

    private static _instance: DGLabPulseService;

    constructor() {
        this.pulseConfig = new ReactiveConfig<DGLabPulseInfo[]>(this.pulseConfigPath, [], {
            autoInit: false,
        });
    }

    public static createInstance() {
        if (!this._instance) {
            this._instance = new DGLabPulseService();
        }
    }

    public static get instance(): DGLabPulseService {
        this.createInstance();
        return this._instance;
    }

    public async initialize(): Promise<void> {
        this.pulseConfig.on('data', (value) => {
            console.log('Pulse list updated.');
            this.pulseList = value;
            this.events.emit('pulseListUpdated', this.getPulseInfoList());
        });

        await this.pulseConfig.initialize();
    }

    public async destroy(): Promise<void> {
        this.pulseConfig.destroy();

        this.events.removeAllListeners();
    }

    public getDefaultPulse(): DGLabPulseInfo {
        return this.pulseList[0] ?? {
            id: 'empty',
            name: 'Empty',
            pulseData: ['0A0A0A0A00000000'],
        };
    }

    public getPulseInfoList(): DGLabPulseBaseInfo[] {
        return this.pulseList;
    }

    public getPulse(pulseId: string, customPulseList?: DGLabPulseInfo[]): DGLabPulseInfo | null {
        if (customPulseList) {
            const customPulse = customPulseList.find(pulse => pulse.id === pulseId);
            if (customPulse) {
                return customPulse;
            }
        }

        return this.pulseList.find(pulse => pulse.id === pulseId) ?? null;
    }

    public getPulseHexData(pulse: DGLabPulseInfo): [string[], number] {
        let totalDuration = pulse.pulseData.length * PULSE_WINDOW;
        return [pulse.pulseData, totalDuration];
    }

    public on = this.events.on.bind(this.events);
    public once = this.events.once.bind(this.events);
    public off = this.events.off.bind(this.events);
    public removeAllListeners = this.events.removeAllListeners.bind(this.events);
}
