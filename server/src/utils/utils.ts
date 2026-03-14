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

/**
 * 简单的对象差异比较，返回两个对象在第一层上不同的键列表，如果没有不同则返回false
 * @param obj1 对象1
 * @param obj2 对象2
 * @param preciseDepth 精确比较深度（超过该深度的对象将使用JSON.stringify比较），默认为3
 * @returns 不同的键列表，如果没有不同则返回false
 */
export const simpleObjDiff = (obj1: any, obj2: any, preciseDepth: number = 3, _prefix: string = ''): string[] | false => {
    if (!obj1 || !obj2) {
        return false;
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
            if (preciseDepth > 0) {
                const subDiff = simpleObjDiff(a, b, preciseDepth - 1, `${_prefix}${key}.`);
                if (subDiff) {
                    differentKeys.push(...subDiff.map(subKey => `${_prefix}${key}.${subKey}`));
                }
            } else if (JSON.stringify(a) !== JSON.stringify(b)) {
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

export const includesPrefix = (strList: string[], prefix: string) => {
    return strList.some(str => str.startsWith(prefix));
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