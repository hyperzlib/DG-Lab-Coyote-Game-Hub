import { EventEmitter } from "koa";
import { asleep } from "./utils";
export class TaskAbortedError extends Error {
    constructor() {
        super('Task aborted');
    }
}
export class Task {
    minInterval;
    events = new EventEmitter();
    running = false;
    autoRestart = true;
    handler;
    abortController = new AbortController();
    waitForStop = null;
    stopResolve = null;
    constructor(handler, options) {
        this.handler = handler;
        this.minInterval = options?.minInterval ?? 100;
        this.autoRestart = options?.autoRestart ?? true;
        this.run().catch((error) => this.handleError(error));
    }
    async run() {
        if (this.running) {
            return;
        }
        const harvest = this.createHarvest(this.abortController);
        this.running = true;
        while (this.running) {
            let startTime = Date.now();
            try {
                await this.handler(this.abortController, harvest);
            }
            catch (error) {
                if (error instanceof TaskAbortedError) { // Task aborted
                    break;
                }
                throw error;
            }
            let endTime = Date.now();
            const sleepTime = Math.max(0, this.minInterval - (endTime - startTime));
            await asleep(sleepTime);
        }
        if (this.stopResolve) {
            this.stopResolve();
        }
    }
    createHarvest(abortController) {
        return () => {
            if (abortController.signal.aborted) {
                throw new TaskAbortedError();
            }
        };
    }
    handleError(error) {
        this.events.emit('error', error);
        if (this.autoRestart) {
            this.run().catch((error) => this.handleError(error));
        }
        else {
            this.running = false;
        }
    }
    async stop() {
        this.waitForStop = new Promise((resolve) => {
            this.stopResolve = resolve;
            this.running = false;
        });
        await this.waitForStop;
    }
    async abort() {
        const stopPromise = this.stop();
        this.abortController.abort();
        await stopPromise;
    }
    on = this.events.on.bind(this.events);
    once = this.events.once.bind(this.events);
    off = this.events.off.bind(this.events);
}
