export interface IEventEmitter {
    on: Function;
    off: Function;
}

export interface EventStoreItem {
    source: IEventEmitter;
    eventName: string;
    callback: Function;
}

export interface wrappedEventSourceItem {
    source: IEventEmitter;
    wrapped: IEventEmitter;
}

export class EventStore {
    private listenedEvents: EventStoreItem[] = [];
    private wrappedEventSources: wrappedEventSourceItem[] = [];

    constructor() {

    }

    /**
     * Wrap the event listener to store the event source and event name
     * @param eventSource 
     */
    public wrap<T extends IEventEmitter>(eventSource: T): T {
        let cached = this.wrappedEventSources.find((item) => item.source === eventSource);
        if (cached) {
            return cached.wrapped as T;
        }

        let wrapped = new Proxy(eventSource, {
            get: (target, prop) => {
                switch (prop) {
                    case 'on':
                    case 'addListener':
                        return this.wrapOn(eventSource);
                    case 'off':
                    case 'removeListener':
                        return this.wrapOff(eventSource);
                    case 'removeAllListeners':
                        return this.wrapRemoveAllListeners(eventSource);
                    default:
                        return (target as any)[prop];
                }
            }
        });

        this.wrappedEventSources.push({
            source: eventSource,
            wrapped
        });

        return wrapped as T;
    }

    private wrapOn<T extends IEventEmitter>(eventSource: T) {
        return (eventName: string, arg1: string | Function, arg2?: Function) => {
            let callback: Function;
            if (typeof arg1 === 'string') {
                eventName = `${eventName}/${arg1}`;
                callback = arg2!;
            } else {
                callback = arg1;
            }

            this.listenedEvents.push({
                source: eventSource,
                eventName,
                callback,
            });

            return eventSource.on(eventName, callback as any);
        }
    }

    private wrapOff<T extends IEventEmitter>(eventSource: T) {
        return (eventName: string, arg1: string | Function, arg2?: Function) => {
            let callback: Function;
            if (typeof arg1 === 'string') {
                eventName = `${eventName}/${arg1}`;
                callback = arg2!;
            } else {
                callback = arg1;
            }

            let eventItem = this.listenedEvents.find((item) => item.source === eventSource && item.eventName === eventName && item.callback === callback);
            if (eventItem) {
                this.listenedEvents = this.listenedEvents.filter((item) => item !== eventItem);
            }

            return eventSource.off(eventName, callback as any);
        }
    }

    private wrapRemoveAllListeners<T extends IEventEmitter>(eventSource: T) {
        return (eventName?: string, arg1?: string) => {
            if (eventName) {
                // Remove all listeners of the specified event
                if (arg1) {
                    eventName = `${eventName}/${arg1}`;
                }

                let shouldRemove = this.listenedEvents.find((item) => item.source === eventSource && item.eventName === eventName);
                if (shouldRemove) {
                    eventSource.off(eventName, shouldRemove.callback as any);
                }

                this.listenedEvents = this.listenedEvents.filter((item) => item.source !== eventSource || item.eventName !== eventName);
            } else {
                let shouldRemove = this.listenedEvents.filter((item) => item.source === eventSource);
                for (let item of shouldRemove) {
                    eventSource.off(item.eventName, item.callback as any);
                }

                this.listenedEvents = this.listenedEvents.filter((item) => item.source !== eventSource);
            }
        };
    }

    /**
     * Remove all event listeners
     */
    public removeAllListeners() {
        for (let eventItem of this.listenedEvents) {
            eventItem.source.off(eventItem.eventName, eventItem.callback as any);
        }

        this.listenedEvents = [];
    }
}