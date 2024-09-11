import { networkInterfaces } from "os";
import { exec } from "child_process";

export const asleep = (ms: number, abortController?: AbortController) => {
    if (abortController) {
        const promise = new Promise<boolean>((resolve) => {
            let resolved = false;

            const onAbort = () => {
                if (!resolved) {
                    clearTimeout(tid);
                    resolve(false);
                }
            };

            abortController.signal.addEventListener('abort', onAbort, { once: true });

            const tid = setTimeout(() => {
                resolve(true);
                resolved = true;
                abortController.signal.removeEventListener('abort', onAbort);
            }, ms);
        });

        return promise;
    } else {
        return new Promise<boolean>((resolve) => setTimeout(() => resolve(true), ms));
    }
};

export const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

export const openBrowser = (url: string) => {
    const command = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${command} ${url}`);
}

export const simpleObjDiff = (obj1: any, obj2: any) => {
    if (!obj1 || !obj2) {
        return [];
    }

    let differentKeys: string[] = [];
    for (let key in obj1) {
        const a = obj1[key];
        const b = obj2[key];

        if (typeof a !== typeof b) {
            differentKeys.push(key);
        } else if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) {
                differentKeys.push(key);
            } else {
                for (let i = 0; i < a.length; i++) {
                    if (a[i] !== b[i]) {
                        differentKeys.push(key);
                        break;
                    }
                }
            }
        } else if (typeof a === 'object' && typeof b === 'object') {
            if (JSON.stringify(a) !== JSON.stringify(b)) {
                differentKeys.push(key);
            }
        } else if (obj1[key] !== obj2[key]) {
            differentKeys.push(key);
        }
    }

    if (differentKeys.length > 0) {
        return differentKeys;
    } else {
        return false;
    }
}
export class LocalIPAddress {
    private static ipAddrList?: string[];

    public static getIPAddrList(): string[] {
        if (!this.ipAddrList) {
            this.ipAddrList = [];

            const interfaces = networkInterfaces();
            Object.keys(interfaces).forEach((name) => {
                if (name.startsWith('lo')) { // ignore loopback interface
                    return;
                }

                interfaces[name]?.forEach((info) => {
                    if (info.family === 'IPv4') {
                        this.ipAddrList!.push(info.address);
                    }
                });
            });
        }

        return this.ipAddrList!;
    }
}