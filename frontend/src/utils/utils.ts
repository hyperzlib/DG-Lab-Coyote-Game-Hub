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