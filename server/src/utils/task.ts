import { EventEmitter } from "events";
import { asleep } from "./utils";

export class TaskAbortedError extends Error {
    constructor() {
        super('Task aborted');
    }
}

export interface TaskOptions {
    minInterval?: number;
    autoRestart?: boolean;
}

export type TaskEventsHandler = {
    (event: 'error', listener: (error: any) => void): void;
};

export function createHarvest(abortController: AbortController): () => void {
    return () => {
        if (abortController.signal.aborted) {
            throw new TaskAbortedError();
        }
    };
}

/**
 * @param abortController
 * @param harvest This function will break the task if the task is aborted.
 */
export type TaskHandler = (abortController: AbortController, harvest: () => void, round: number) => Promise<void>;

export class Task {
    public minInterval: number;
    public events: EventEmitter = new EventEmitter();
    public running: boolean = false;
    public autoRestart: boolean = true;

    private handler: TaskHandler;

    private abortController: AbortController = new AbortController();
    private waitForStop: Promise<void> | null = null;
    private stopResolve: (() => void) | null = null;

    constructor(handler: TaskHandler, options?: TaskOptions) {
        this.handler = handler;
        
        this.minInterval = options?.minInterval ?? 100;
        this.autoRestart = options?.autoRestart ?? true;

        this.run().catch((error) => this.handleError(error));
    }

    public async run(): Promise<void> {
        if (this.running) {
            return;
        }

        const harvest = createHarvest(this.abortController);

        this.running = true;
        let round = 0;
        while (this.running) {
            let startTime = Date.now();
            try {
                await this.handler(this.abortController, harvest, round);
            } catch (error) {
                if (error instanceof TaskAbortedError) { // Task aborted
                    break;
                }
                throw error;
            }
            let endTime = Date.now();

            const sleepTime = Math.max(0, this.minInterval - (endTime - startTime));
            await asleep(sleepTime);

            round ++;
        }

        if (this.stopResolve) {
            this.stopResolve();
        }
    }

    public handleError(error: Error) {
        this.events.emit('error', error);
        if (this.autoRestart) {
            this.run().catch((error) => this.handleError(error));
        } else {
            this.running = false;
        }
    }

    public async stop(): Promise<void> {
        this.waitForStop = new Promise<void>((resolve) => {
            this.stopResolve = resolve;
            this.running = false;
        });
        
        await this.waitForStop;
    }

    public async abort(): Promise<void> {
        const stopPromise = this.stop();
        this.abortController.abort();
        await stopPromise;
    }

    public on: TaskEventsHandler = this.events.on.bind(this.events);
    public once: TaskEventsHandler = this.events.once.bind(this.events);
    public off = this.events.off.bind(this.events);
}