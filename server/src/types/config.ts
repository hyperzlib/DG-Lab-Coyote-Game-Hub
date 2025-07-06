import { z } from "koa-swagger-decorator";
import { RemoteNotificationInfoSchema } from "./server.js";

export const DatabaseTypeSchema = z.enum(['mysql', 'sqlite', 'postgres'])
    .describe('数据库类型，支持mysql、sqlite和postgresql');
export type DatabaseType = z.infer<typeof DatabaseTypeSchema>;

export const MysqlConfigSchema = z.object({
    host: z.string().default('localhost')
        .describe('MySQL服务器主机名或IP地址，默认localhost'),
    port: z.number().int().min(1).max(65535).default(3306)
        .describe('MySQL服务器端口号，范围1-65535，默认3306'),
    username: z.string().default('root')
        .describe('MySQL用户名，默认root'),
    password: z.string().optional()
        .describe('MySQL密码'),
    database: z.string().default('dg_lab')
        .describe('MySQL数据库名称，默认dg_lab'),
}).describe('MySQL数据库配置');
export type MysqlConfigType = z.infer<typeof MysqlConfigSchema>;

export const SqliteConfigSchema = z.object({
    file: z.string().default('data/database.sqlite')
        .describe('SQLite数据库文件路径，默认data/database.sqlite'),
}).describe('SQLite数据库配置');
export type SqliteConfigType = z.infer<typeof SqliteConfigSchema>;

export const PostgresqlConfigSchema = z.object({
    host: z.string().default('localhost')
        .describe('PostgreSQL服务器主机名或IP地址，默认localhost'),
    port: z.number().int().min(1).max(65535).default(5432)
        .describe('PostgreSQL服务器端口号，范围1-65535，默认5432'),
    username: z.string().default('postgres')
        .describe('PostgreSQL用户名，默认postgres'),
    password: z.string().optional()
        .describe('PostgreSQL密码'),
    database: z.string().default('dg_lab')
        .describe('PostgreSQL数据库名称，默认dg_lab'),
}).describe('PostgreSQL数据库配置');
export type PostgresqlConfigType = z.infer<typeof PostgresqlConfigSchema>;

export const MainConfigSchema = z.object({
    port: z.number().int().min(1).max(65535).default(8920)
        .describe('服务器端口号，范围1-65535，默认8920'),
    host: z.string().default('localhost')
        .describe('服务器主机名或IP地址，默认localhost'),
    databaseType: DatabaseTypeSchema.default('sqlite')
        .describe('数据库类型，支持mysql、sqlite和postgresql，默认sqlite'),
    databaseConfig: z.union([
            SqliteConfigSchema,
            MysqlConfigSchema,
            PostgresqlConfigSchema,
        ])
        .default({})
        .describe('数据库配置，根据databaseType自动选择对应的配置'),
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