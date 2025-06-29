import { CustomSkinInfoSchema } from "#app/types/customSkin.js";
import { z } from "koa-swagger-decorator";

export const WebApiResponseSchema = z.object({
    status: z.number().int().describe('响应状态码，1表示成功，0表示失败'),
    code: z.string().describe('字符串类型的响应代码，成功时通常为"OK"，错误时是"ERR::"开头的错误代码'),
    message: z.string().describe('响应消息').optional(),
});

export const ServerInfoResponseSchema = WebApiResponseSchema.extend({
    server: z.object({
        wsUrl: z.string().describe('WebSocket 连接地址'),
        clientWsUrls: z.array(z.object({
            domain: z.string().describe('客户端域名'),
            connectUrl: z.string().describe('客户端 WebSocket 连接地址'),
        })).describe('客户端 WebSocket 连接地址列表'),
        apiBaseHttpUrl: z.string().describe('API 基础 HTTP 地址'),
    }),
}).describe('服务器信息响应');
export type ServerInfoResponse = z.infer<typeof ServerInfoResponseSchema>;

export const GetCustomSkinListResponseSchema = WebApiResponseSchema.extend({
    customSkins: z.array(CustomSkinInfoSchema).describe('自定义皮肤列表'),
});
export type GetCustomSkinListResponse = z.infer<typeof GetCustomSkinListResponseSchema>;

export const GetClientConnectInfoResponseSchema = WebApiResponseSchema.extend({
    clientId: z.string().describe('客户端 ID'),
}).describe('获取客户端连接信息响应');
export type GetClientConnectInfoResponse = z.infer<typeof GetClientConnectInfoResponseSchema>;