export type MainConfigType = {
    port: number;
    host: string;
    proxySSLEnable?: boolean;
    domain?: string | null;
    wsDomain?: string | null;
    pulseConfigPath: string;
    openBrowser?: boolean;
};