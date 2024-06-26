import { networkInterfaces } from "os";
export const asleep = (ms, abortController) => {
    if (abortController) {
        const promise = new Promise((resolve) => {
            let resolved = false;
            const onAbort = () => {
                if (!resolved) {
                    clearTimeout(tid);
                    resolve();
                }
            };
            abortController.signal.addEventListener('abort', onAbort, { once: true });
            const tid = setTimeout(() => {
                resolve();
                resolved = true;
                abortController.signal.removeEventListener('abort', onAbort);
            }, ms);
        });
        return promise;
    }
    else {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
};
export const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export class LocalIPAddress {
    static ipAddrList;
    static getIPAddrList() {
        if (!this.ipAddrList) {
            this.ipAddrList = [];
            const interfaces = networkInterfaces();
            Object.keys(interfaces).forEach((name) => {
                if (name.startsWith('lo')) { // ignore loopback interface
                    return;
                }
                interfaces[name]?.forEach((info) => {
                    if (info.family === 'IPv4') {
                        this.ipAddrList.push(info.address);
                    }
                });
            });
        }
        return this.ipAddrList;
    }
}
