export type ServerInfoResData = {
    server: {
        wsUrl: string,
        clientWsUrls: ClientConnectUrlInfo[],
    },
};

export type ClientConnectUrlInfo = {
    domain: string;
    connectUrl: string;
};

export type ClientConnectInfoResData = {
    clientId: string,
};

export type ApiResponse<T> = {
    status: number,
    message?: string,
} & T;

export const webApi = {
    getServerInfo: async (): Promise<ApiResponse<ServerInfoResData> | null> => {
        try {
            const response = await fetch('/api/server_info');
            return response.json();
        }
        catch (error) {
            console.error('Failed to get server info:', error);
            return null;
        }
    },
    getClientConnectInfo: async (): Promise<ApiResponse<ClientConnectInfoResData> | null> => {
        try {
            const response = await fetch('/api/client/connect');
            return response.json();
        }
        catch (error) {
            console.error('Failed to get client connect info:', error);
            return null;
        }
    },
};