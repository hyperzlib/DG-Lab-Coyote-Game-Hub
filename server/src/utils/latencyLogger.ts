export class LatencyLogger {
    private taskName: string | null = null;
    private startTime: number | null = null;
    private previousTime: number | null = null;

    constructor() { }

    public start(taskName: string) {
        this.taskName = taskName;
        this.startTime = Date.now();
    }

    public finish() {
        this.taskName = null;
        this.startTime = null;
    }

    public log(method: string = '') {
        return; // Disable latency logger

        // if (!this.taskName || !this.startTime) {
        //     return;
        // }

        // const endTime = Date.now();
        // const fullLatency = endTime - this.startTime;
        // const latency = this.previousTime ? endTime - this.previousTime : 0;

        // this.previousTime = endTime;

        // console.log(`Latency trace: [${this.taskName}/${method}] - Latency: ${latency}ms (${fullLatency}ms)`);
    }
}