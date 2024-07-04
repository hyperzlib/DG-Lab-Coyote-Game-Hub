export type MainConfigType = {
    port: number;
    host: string;
    proxySSLEnable?: boolean;
    domain?: string | null;
    /** 单独配置客户端连接时的WebSocket地址 */
    clientWsDomain?: string | null;
    /** 波形配置文件路径 */
    pulseConfigPath: string;
    /** 服务器启动后自动打开浏览器 */
    openBrowser?: boolean;
    /** 允许插件API向所有客户端发送指令 */
    allowBroadcastToClients?: boolean;
};