export type MainConfigType = {
    port: number;
    host: string;
    /** 是否使用反向代理，开启后会使用反向代理的配置 */
    reverseProxy?: boolean;
    /** 作为服务部署时，配置控制台的Base URL，格式：http://www.example.com:1234或https://www.example.com */
    webBaseUrl?: string;
    /** 网页控制台的WebSocket Base URL，需要包含协议类型 */
    webWsBaseUrl?: string | null;
    /** DG-Lab客户端连接时的WebSocket URL */
    clientWsBaseUrl?: string | null;
    /** 波形配置文件路径 */
    pulseConfigPath: string;
    /** 服务器启动后自动打开浏览器 */
    openBrowser?: boolean;
    /** 允许插件API向所有客户端发送指令 */
    allowBroadcastToClients?: boolean;
} & Record<string, any>;