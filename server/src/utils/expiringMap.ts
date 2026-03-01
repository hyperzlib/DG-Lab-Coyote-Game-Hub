export interface ExpiringMapOptions {
    ttl: number;
    cleanupInterval?: number;
    refreshOnGet?: boolean;
    refreshOnHas?: boolean;
}

export class ExpiringMap<K, V> extends globalThis.Map<K, V> {
    public readonly ttl: number;
    public readonly cleanupInterval: number;
    public readonly refreshOnGet: boolean;
    public readonly refreshOnHas: boolean;

    private readonly accessTimeMap = new globalThis.Map<K, number>();
    private cleanupTimer: ReturnType<typeof setInterval>;

    public constructor(options: ExpiringMapOptions) {
        super();

        if (options.ttl <= 0) {
            throw new Error('ttl must be greater than 0');
        }

        this.ttl = options.ttl;
        this.cleanupInterval = options.cleanupInterval ?? Math.max(1000, Math.floor(this.ttl / 2));
        this.refreshOnGet = options.refreshOnGet ?? true;
        this.refreshOnHas = options.refreshOnHas ?? false;

        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, this.cleanupInterval);

        if ('unref' in this.cleanupTimer && typeof this.cleanupTimer.unref === 'function') {
            this.cleanupTimer.unref();
        }
    }

    public override get(key: K): V | undefined {
        const exists = super.has(key);
        const value = super.get(key);
        if (exists && this.refreshOnGet) {
            this.touch(key);
        }
        return value;
    }

    public override has(key: K): boolean {
        const exists = super.has(key);
        if (exists && this.refreshOnHas) {
            this.touch(key);
        }
        return exists;
    }

    public override set(key: K, value: V): this {
        super.set(key, value);
        this.touch(key);
        return this;
    }

    public override delete(key: K): boolean {
        this.accessTimeMap.delete(key);
        return super.delete(key);
    }

    public override clear(): void {
        this.accessTimeMap.clear();
        super.clear();
    }

    public destroy(): void {
        clearInterval(this.cleanupTimer);
    }

    public cleanup(now = Date.now()): void {
        for (const [key, accessTime] of this.accessTimeMap.entries()) {
            if (now - accessTime > this.ttl) {
                super.delete(key);
                this.accessTimeMap.delete(key);
            }
        }
    }

    private touch(key: K): void {
        this.accessTimeMap.set(key, Date.now());
    }
}
