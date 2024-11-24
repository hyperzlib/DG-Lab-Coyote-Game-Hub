export interface ObjectSchemaStore {
    version: number;
    defaultEmptyObject: any;
    upgrade: (oldObject: any) => any;
}

export type VersionedObject<T> = T & { version: number };

export class ObjectUpdater {
    public objectSchemas: ObjectSchemaStore[] = [];

    constructor() {
        this.registerSchemas();
    }

    /**
     * 注册schema
     * 继承的类可以重写这个方法，用于注册不同版本的schema
     */
    protected registerSchemas(): void {
        
    }

    public addSchema(version: number, upgrade: (oldObject: any) => any, defaultEmptyObject: any = {}): void {
        let prevSchema = this.objectSchemas[this.objectSchemas.length - 1];
        this.objectSchemas.push({ version, defaultEmptyObject, upgrade });

        if (prevSchema.version > version) { // 如果添加的版本号比前一个版本号小，则重新排序
            this.objectSchemas.sort((a, b) => a.version - b.version);
        }
    }

    /**
     * 将对象升级到最新版本
     * @param object 
     * @param version 
     * @returns 
     */
    public updateObject<T>(object: T): T {
        let currentObject = object;
        let version = (object as any).version || 0;
        for (let i = 0; i < this.objectSchemas.length; i++) {
            let schema = this.objectSchemas[i];
            if (schema.version > version) {
                currentObject = schema.upgrade(currentObject);
            }
        }
        return currentObject;
    }

    /**
     * 获取默认的空对象
     * @returns 
     */
    public getDefaultEmptyObject(): any {
        const defaultEmptyObject = this.objectSchemas[this.objectSchemas.length - 1].defaultEmptyObject;
        if (typeof defaultEmptyObject === 'function') {
            return defaultEmptyObject();
        } else {
            return defaultEmptyObject;
        }
    }

    public getCurrentVersion(): number {
        return this.objectSchemas[this.objectSchemas.length - 1].version;
    }
}