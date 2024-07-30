export type EventDef = {
    [eventName: string]: any[];
};

export type EventAddListenerFunc<T extends EventDef> = {
    <K extends keyof T>(eventName: K, listener: (...args: T[K]) => void): any;
    (eventName: string, listener: (...args: any[]) => void): any;
};

export type EventRemoveListenerFunc<T extends EventDef> = {
    <K extends keyof T>(eventName: K, listener?: (...args: T[K]) => void): any;
    (eventName: string, listener?: (...args: any[]) => void): any;
};