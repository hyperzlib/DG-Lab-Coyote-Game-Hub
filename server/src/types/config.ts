import { z } from "koa-swagger-decorator";
import { RemoteNotificationInfoSchema } from "./server.js";

export const MainConfigSchema = z.object({
    port: z.number().int().min(1).max(65535).default(8920)
        .describe('服务器端口号，范围1-65535，默认8920'),
    host: z.string().default('localhost')
        .describe('服务器主机名或IP地址，默认localhost'),
    reverseProxy: z.boolean().optional().default(false)
        .describe('是否启用反向代理，默认false'),
    webBaseUrl: z.string().url().optional()
        .describe('网页控制台的Base URL'),
    webWsBaseUrl: z.string().url().optional().nullable()
        .describe('网页控制台的WebSocket Base URL'),
    clientWsBaseUrl: z.string().url().optional().nullable()
        .describe('DG-Lab客户端连接时的WebSocket URL'),
    apiBaseHttpUrl: z.string().url().optional()
        .describe('API的基础URL'),
    enableAccessLogger: z.boolean().optional().default(false)
        .describe('是否启用访问日志记录，默认false'),
    pulseConfigPath: z.string().default('pulse.json')
        .describe('波形配置文件路径'),
    openBrowser: z.boolean().optional().default(false)
        .describe('服务器启动后是否自动打开浏览器，默认false'),
    allowBroadcastToClients: z.boolean().optional().default(false)
        .describe('是否允许插件API向所有客户端发送指令，默认false'),
    hideWebUpdateNotification: z.boolean().optional().default(false)
        .describe('是否在网页控制台隐藏更新通知，默认false'),
    siteNotifications: z.array(RemoteNotificationInfoSchema).optional().default([])
        .describe('站点通知列表'),
}).passthrough().describe('服务器主配置');

export type MainConfigType = z.infer<typeof MainConfigSchema>;