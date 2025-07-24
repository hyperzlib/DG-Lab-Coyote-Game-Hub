import { networkInterfaces } from "os";
import { exec } from "child_process";
import { v4 as uuidv4 } from 'uuid';

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

export const debounce = <T extends (...args: any[]) => void>(func: T, wait: number): T => {
    let timeout: NodeJS.Timeout | null = null;
    return function (this: any, ...args: any[]) {
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => func.apply(this, args), wait);
    } as T;
};

export const throttle = <T extends (...args: any[]) => void>(func: T, limit: number): T => {
    let lastCall = 0;
    return function (this: any, ...args: any[]) {
        const now = Date.now();
        if (now - lastCall >= limit) {
            lastCall = now;
            func.apply(this, args);
        }
    } as T;
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

export function firstHeader(headerItem: string | string[] | undefined): string | undefined {
    if (Array.isArray(headerItem)) {
        return headerItem[0];
    } else if (typeof headerItem === 'string') {
        return headerItem;
    } else {
        return undefined;
    }
}

export async function generateUUIDWithValidation(validator: (generatedUuid: string) => Promise<boolean>, maxTries = 10): Promise<string> {
    for (let i = 0; i < maxTries; i++) {
        const uuid = uuidv4();
        const isValid = await validator(uuid);
        if (isValid) {
            return uuid;
        }
    }

    throw new Error('Failed to generate a valid UUID after maximum attempts');
}