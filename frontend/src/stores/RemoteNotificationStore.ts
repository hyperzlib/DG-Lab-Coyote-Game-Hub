import { defineStore } from 'pinia'

export const useRemoteNotificationStore = defineStore('remoteNotification', {
    state: () => ({
        ignoredIds: [] as string[]
    }),
    actions: {
        isIgnored(id: string) {
            return this.ignoredIds.includes(id);
        },
        ignore(id: string) {
            this.ignoredIds.push(id);
        },
    },
    persist: {
        key: 'CGH_RemoteNotification'
    }
});