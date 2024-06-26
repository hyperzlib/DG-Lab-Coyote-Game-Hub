export class EventStore {
    listenedEvents = [];
    wrappedEventSources = [];
    constructor() {
    }
    /**
     * Wrap the event listener to store the event source and event name
     * @param eventSource
     */
    wrap(eventSource) {
        let cached = this.wrappedEventSources.find((item) => item.source === eventSource);
        if (cached) {
            return cached.wrapped;
        }
        let wrapped = new Proxy(eventSource, {
            get: (target, prop) => {
                switch (prop) {
                    case 'on':
                        return this.wrapOn(eventSource);
                    case 'off':
                        return this.wrapOff(eventSource);
                    default:
                        return target[prop];
                }
            }
        });
        this.wrappedEventSources.push({
            source: eventSource,
            wrapped
        });
        return wrapped;
    }
    wrapOn(eventSource) {
        return (eventName, callback) => {
            this.listenedEvents.push({
                source: eventSource,
                eventName,
                callback
            });
            return eventSource.on(eventName, callback);
        };
    }
    wrapOff(eventSource) {
        return (eventName, callback) => {
            let eventItem = this.listenedEvents.find((item) => item.source === eventSource && item.eventName === eventName && item.callback === callback);
            if (eventItem) {
                this.listenedEvents = this.listenedEvents.filter((item) => item !== eventItem);
            }
            return eventSource.off(eventName, callback);
        };
    }
    /**
     * Remove all event listeners
     */
    removeAllListeners() {
        for (let eventItem of this.listenedEvents) {
            eventItem.source.off(eventItem.eventName, eventItem.callback);
        }
        this.listenedEvents = [];
    }
}
