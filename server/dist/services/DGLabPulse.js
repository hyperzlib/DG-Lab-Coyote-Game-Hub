import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import { EventEmitter } from 'events';
import { randomInt } from '../utils/utils';
const PULSE_WINDOW = 100; // 100ms
export class DGLabPulseService {
    pulseList = [];
    pulseConfig = 'data/pulse.yaml';
    fsObserver = null;
    events = new EventEmitter();
    static _instance;
    static createInstance() {
        if (!this._instance) {
            this._instance = new DGLabPulseService();
        }
    }
    static get instance() {
        this.createInstance();
        return this._instance;
    }
    async initialize() {
        await this.readConfig();
        await this.watchConfig();
    }
    async destroy() {
        if (this.fsObserver) {
            this.fsObserver.close();
        }
        this.events.removeAllListeners();
    }
    on = this.events.on.bind(this.events);
    once = this.events.once.bind(this.events);
    off = this.events.off.bind(this.events);
    async readConfig() {
        try {
            const fileContent = await fs.promises.readFile(this.pulseConfig, 'utf8');
            this.pulseList = yaml.load(fileContent);
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Failed to read pulse config:', error);
            }
        }
        if (!Array.isArray(this.pulseList)) {
            this.pulseList = [];
        }
    }
    async watchConfig() {
        const pulseConfigDir = path.dirname(this.pulseConfig);
        this.fsObserver = fs.watch(pulseConfigDir, async (eventType, filename) => {
            if (eventType === 'change' && filename === path.basename(this.pulseConfig)) {
                await this.readConfig();
                this.events.emit('pulseListUpdated');
            }
        });
    }
    getDefaultPulse() {
        return this.pulseList[0] ?? {
            id: 'default',
            name: 'Default',
            script: [{ wait: 1000 }],
        };
    }
    getPulse(pulseId) {
        return this.pulseList.find(pulse => pulse.id === pulseId) ?? null;
    }
    buildPulse(pulse) {
        let totalDuration = 0;
        const pulseItems = [];
        const script = pulse.script;
        for (const scriptItem of script) {
            let repeatTimes = 0;
            if (scriptItem.repeat) {
                if (Array.isArray(scriptItem.repeat)) {
                    repeatTimes = randomInt(scriptItem.repeat[0], scriptItem.repeat[1]);
                }
                else {
                    repeatTimes = scriptItem.repeat;
                }
            }
            for (let i = 0; i < repeatTimes; i++) {
                if (scriptItem.pulse) {
                    const pulseTime = PULSE_WINDOW * scriptItem.pulse.length;
                    pulseItems.push(...scriptItem.pulse);
                    totalDuration += pulseTime;
                }
                if (scriptItem.wait) {
                    let waitTime;
                    if (Array.isArray(scriptItem.wait)) {
                        waitTime = randomInt(scriptItem.wait[0], scriptItem.wait[1]);
                    }
                    else {
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
}
