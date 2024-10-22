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

export function hexStringToUint8Array(hexString: string): Uint8Array {
    if (hexString.length % 2 !== 0) {
        throw new Error('Hex string length must be even');
    }

    const array = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < hexString.length; i += 2) {
        array[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
    }
    return array;
}

export function uint8ArrayToHexString(array: Uint8Array): string {
    return Array.from(array).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function asleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export function inputToClipboard(input: HTMLInputElement | HTMLTextAreaElement) {
    input.select();
    if (document.execCommand) {
        document.execCommand('copy');
    } else if (navigator.clipboard) {
        navigator.clipboard.writeText(input.value);
    }
}