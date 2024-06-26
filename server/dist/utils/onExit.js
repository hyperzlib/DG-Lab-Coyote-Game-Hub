export class OnExit {
    static callbacks = [];
    static init() {
        process.on('SIGINT', async () => {
            await OnExit.run();
        });
        process.on('SIGTERM', async () => {
            await OnExit.run();
        });
    }
    static register(callback) {
        OnExit.callbacks.push(callback);
    }
    static async run() {
        for (const callback of OnExit.callbacks) {
            await callback();
        }
        process.exit(0);
    }
}
OnExit.init();
