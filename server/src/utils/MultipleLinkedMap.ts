import { simpleArrayDiff } from "./utils";

export class MultipleLinkedMap<K, V> {
    private _map = new Map<K, V[]>();
    private _reverseMap = new Map<V, K>();

    public get map() {
        return this._map;
    }

    public get reverseMap() {
        return this._reverseMap;
    }

    public get keysCount() {
        return this._map.size;
    }

    public get valuesCount() {
        return this._reverseMap.size;
    }

    public keys() {
        return this._map.keys();
    }

    public values() {
        return this._reverseMap.keys();
    }

    public getFieldValues(key: K): V[] {
        return this._map.get(key) || [];
    }

    public getFieldKey(value: V): K | undefined {
        return this._reverseMap.get(value);
    }

    public addFieldValue(key: K, value: V) {
        let values = this._map.get(key);
        if (!values) {
            values = [];
            this._map.set(key, values);
        }
        values.push(value);
        this._reverseMap.set(value, key);
    }

    public removeFieldValue(key: K, value: V) {
        let values = this._map.get(key);
        if (values) {
            let index = values.indexOf(value);
            if (index !== -1) {
                values.splice(index, 1);
                if (values.length === 0) {
                    this._map.delete(key);
                }
            }
        }
        this._reverseMap.delete(value);
    }

    public setFieldValues(key: K, values: V[]) {
        let added = values;
        let removed: V[] = [];

        let oldValues = this._map.get(key);
        if (oldValues) {
            let diffResult = simpleArrayDiff(oldValues, values);
            added = diffResult.added;
            removed = diffResult.removed;
        }

        this._map.set(key, values);
        
        for (let value of removed) {
            this._reverseMap.delete(value);
        }
        for (let value of added) {
            this._reverseMap.set(value, key);
        }
    }

    public removeField(key: K) {
        let values = this._map.get(key);
        if (values) {
            for (let value of values) {
                this._reverseMap.delete(value);
            }
        }
        this._map.delete(key);
    }

    public clear() {
        this._map.clear();
        this._reverseMap.clear();
    }
}