export type MainConfigType = {
    port: number;
    host: string;
    proxySSLEnable?: boolean;
    domain?: string;
    wsDomain?: string;
    pulseConfigPath: string;
};