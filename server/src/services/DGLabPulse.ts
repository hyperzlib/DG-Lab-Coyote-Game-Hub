import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import { EventEmitter } from 'events';
import { randomInt } from '../utils/utils';

const PULSE_WINDOW = 100; // 100ms

export interface DGLabPulseScript {
    pulse?: string[];
    wait?: number | number[];
    repeat?: number | number[];
}

export interface DGLabPulseBaseInfo {
    id: string;
    name: string;
}

export interface DGLabPulseInfo extends DGLabPulseBaseInfo {
    script: DGLabPulseScript[];
}

export interface DGLabPulseServiceEvents {
    pulseListUpdated: [pulseList: DGLabPulseBaseInfo[]];
}

export class DGLabPulseService {
    public pulseList: DGLabPulseInfo[] = [];

    private pulseConfig = 'data/pulse.yaml';
    private fsObserver: fs.FSWatcher | null = null;
    private events = new EventEmitter<DGLabPulseServiceEvents>();

    private static _instance: DGLabPulseService;

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
        await this.readConfig();
        await this.watchConfig();
    }

    public async destroy(): Promise<void> {
        if (this.fsObserver) {
            this.fsObserver.close();
        }

        this.events.removeAllListeners();
    }

    private async readConfig(): Promise<void> {
        try {
            const fileContent = await fs.promises.readFile(this.pulseConfig, 'utf8');
            this.pulseList = yaml.load(fileContent) as DGLabPulseInfo[];
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                console.error('Failed to read pulse config:', error);
            }
        }

        if (!Array.isArray(this.pulseList)) {
            this.pulseList = [];
        }
    }

    private async watchConfig(): Promise<void> {
        const pulseConfigDir = path.dirname(this.pulseConfig);

        this.fsObserver = fs.watch(pulseConfigDir, async (eventType, filename) => {
            if (eventType === 'change' && filename === path.basename(this.pulseConfig)) {
                await this.readConfig();
                this.events.emit('pulseListUpdated', this.getPulseInfoList());
            }
        });
    }

    public getDefaultPulse(): DGLabPulseInfo {
        return this.pulseList[0] ?? {
            id: 'default',
            name: 'Default',
            script: [{ wait: 1000 }],
        }
    }

    public getPulseInfoList(): DGLabPulseBaseInfo[] {
        return this.pulseList.map(pulse => ({ id: pulse.id, name: pulse.name }));
    }

    public getPulse(pulseId: string): DGLabPulseInfo | null {
        return this.pulseList.find(pulse => pulse.id === pulseId) ?? null;
    }

    public buildPulse(pulse: DGLabPulseInfo): [string[], number] {
        let totalDuration = 0;
        const pulseItems: string[] = [];
        const script = pulse.script;

        for (const scriptItem of script) {
            let repeatTimes = 1;
            if (scriptItem.repeat) {
                if (Array.isArray(scriptItem.repeat)) {
                    repeatTimes = randomInt(scriptItem.repeat[0], scriptItem.repeat[1]);
                } else {
                    repeatTimes = scriptItem.repeat;
                }
            }

            for (let i = 0; i < repeatTimes; i ++) {
                if (scriptItem.pulse) {
                    const pulseTime = PULSE_WINDOW * scriptItem.pulse.length;
                    pulseItems.push(...scriptItem.pulse);
                    totalDuration += pulseTime;
                }

                if (scriptItem.wait) {
                    let waitTime: number;
                    if (Array.isArray(scriptItem.wait)) {
                        waitTime = randomInt(scriptItem.wait[0], scriptItem.wait[1]);
                    } else {
                        waitTime = scriptItem.wait;
                    }
                    const waitFrames = Math.ceil(waitTime / PULSE_WINDOW);
                    for (let i = 0; i < waitFrames; i++) {
                        pulseItems.push('0000000000000000');
                    }
                    totalDuration += waitFrames * PULSE_WINDOW;
                }
            }
        }

        return [pulseItems, totalDuration];
    }

    public on = this.events.on.bind(this.events);
    public once = this.events.once.bind(this.events);
    public off = this.events.off.bind(this.events);
    public removeAllListeners = this.events.removeAllListeners.bind(this.events);
}
