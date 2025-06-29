import { ExEventEmitter } from "#app/utils/ExEventEmitter.js";
import { RemoteNotificationInfo } from "#app/types/server.js";
import { MainConfig } from "#app/config.js";

export interface SiteNotificationManagerService {
    newNotification: [notification: RemoteNotificationInfo];
}

export class SiteNotificationService {
    private static _instance: SiteNotificationService;

    private events = new ExEventEmitter<SiteNotificationManagerService>();

    private notifications: RemoteNotificationInfo[] = [];

    constructor() {

    }

    public static createInstance() {
        if (!this._instance) {
            this._instance = new SiteNotificationService();
        }
    }

    public static get instance() {
        this.createInstance();
        return this._instance;
    }

    public async initialize() {
        if (MainConfig.value.siteNotifications) {
            this.notifications = MainConfig.value.siteNotifications;
        }
    }

    public addNotification(notification: RemoteNotificationInfo) {
        this.notifications.push(notification);
        this.events.emit('newNotification', notification);
    }

    public getNotifications() {
        return this.notifications;
    }

    public on = this.events.on.bind(this.events);
    public once = this.events.once.bind(this.events);
    public off = this.events.off.bind(this.events);
    public removeAllListeners = this.events.removeAllListeners.bind(this.events);
}