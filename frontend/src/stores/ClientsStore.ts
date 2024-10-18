import { defineStore } from 'pinia'

export interface ClientInfo {
    id: string;
    name: string;
    lastConnectTime: number;
}

export const useClientsStore = defineStore('clients', {
    state: () => ({
        clientList: [] as ClientInfo[]
    }),
    actions: {
        addClient(id: string, name: string) {
            this.clientList.push({ id, name, lastConnectTime: Date.now() });
        },
        getClientInfo(id: string) {
            return this.clientList.find(c => c.id === id);
        },
        updateClientName(id: string, name: string) {
            const client = this.clientList.find(c => c.id === id);
            if (client) {
                client.name = name;
            }
        },
        updateClientConnectTime(id: string) {
            const client = this.clientList.find(c => c.id === id);
            if (client) {
                client.lastConnectTime = Date.now();
            }
        },
    },
    persist: {
        key: 'CGH_Clients'
    }
});