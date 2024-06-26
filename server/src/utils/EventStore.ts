export interface IEventEmitter {
    on(eventName: string, callback: Function): any;
    off(eventName: string, callback?: Function): any;
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
                        return this.wrapOn(eventSource);
                    case 'off':
                        return this.wrapOff(eventSource);
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
        return (eventName: string, callback: Function) => {
            this.listenedEvents.push({
                source: eventSource,
                eventName,
                callback
            });

            return eventSource.on(eventName, callback);
        }
    }

    private wrapOff<T extends IEventEmitter>(eventSource: T) {
        return (eventName: string, callback?: Function) => {
            let eventItem = this.listenedEvents.find((item) => item.source === eventSource && item.eventName === eventName && item.callback === callback);
            if (eventItem) {
                this.listenedEvents = this.listenedEvents.filter((item) => item !== eventItem);
            }

            return eventSource.off(eventName, callback);
        }
    }

    /**
     * Remove all event listeners
     */
    public removeAllListeners() {
        for (let eventItem of this.listenedEvents) {
            eventItem.source.off(eventItem.eventName, eventItem.callback);
        }

        this.listenedEvents = [];
    }
}