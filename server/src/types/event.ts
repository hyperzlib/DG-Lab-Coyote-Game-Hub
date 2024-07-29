export type EventDef = {
    [eventName: string]: any[];
};

export type EventListenerFunc<T extends EventDef> = {
    <K extends keyof T>(eventName: K, listener: (...args: T[K]) => void): any;
    (eventName: string, listener: (...args: any[]) => void): any;
};

export type EventRemoveAllFunc<T extends EventDef> = {
    <K extends keyof T>(eventName?: K): any;
    (eventName?: string): any;
};