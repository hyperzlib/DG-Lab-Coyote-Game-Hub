import { GameStrengthConfigSchema, MainGameConfigSchema } from "#app/types/game.js";
import def from "ajv/dist/vocabularies/applicator/additionalItems.js";
import { z } from "koa-swagger-decorator";


const AutoCastInt = <Schema extends (z.ZodNumber)>(schema: Schema) => {
    return (
        z.preprocess((value) => {
            switch (typeof value) {
                case "string":
                    if (!/^-?\d+$/.test(value)) {
                        return value; // 如果不是整数字符串，直接返回原值
                    }
                    return parseInt(value, 10);
                default:
                    return value;
            }
        }, schema)
    )
}

const AutoCastBool = <Schema extends (z.ZodBoolean)>(schema: Schema) => {
    return (
        z.preprocess((value) => {
            switch (typeof value) {
                case "string":
                    switch (value.toLowerCase()) {
                        case 'true':
                            return true;
                        case 'false':
                            return false;
                        case '1':
                            return true; // 字符串 '1' 视为 true
                        case '0':
                            return false; // 字符串 '0' 视为 false
                        default:
                            return value; // 如果不是布尔字符串，直接返回原值
                    }
                break;
                case "number":
                    if (value === 1) return true; // 数字 1 视为 true
                    if (value === 0) return false; // 数字 0 视为 false
                    return value; // 其他数字直接返回
                default:
                    return value; // 其他类型直接返回
            }
        }, schema)
    )
}

export const ClientIdSchema = z.union([
    z.string().describe('客户端ID'),
    z.enum(['all']).describe('所有客户端'),
]).describe('客户端ID');

export const ClientStrengthInfoSchema = z.object({
    strength: z.number().int().min(0).max(200).describe('当前强度'),
    limit: z.number().int().min(0).max(200).describe('强度限制'),
}).describe('强度信息');

export const ApiResponseSchema = z.object({
    status: z.number().int().describe('响应状态码，1表示成功，0表示失败'),
    code: z.string().describe('响应代码，标识具体的错误或状态'),
    message: z.string().optional().describe('可选的响应消息，提供额外信息'),
    warnings: z.array(z.object({
        code: z.string().describe('警告代码'),
        message: z.string().describe('警告消息')
    })).optional().describe('可选的警告列表'),
}).passthrough().describe('API响应格式');
export type ApiResponseType = z.infer<typeof ApiResponseSchema>;

export const GetGameApiInfoResponseSchema = ApiResponseSchema.extend({
    minApiVersion: z.number().int().describe('最小API版本号'),
    maxApiVersion: z.number().int().describe('最大API版本号'),
}).describe('获取游戏API信息响应格式');
export type GetGameApiInfoResponse = z.infer<typeof GetGameApiInfoResponseSchema>;

export const GetGameInfoResponseSchema = ApiResponseSchema.extend({
    strengthConfig: GameStrengthConfigSchema.optional().nullable().describe('游戏强度配置'),
    gameConfig: MainGameConfigSchema.optional().nullable().describe('游戏配置'),
    clientStrength: ClientStrengthInfoSchema.optional().nullable().describe('客户端强度信息'),
    currentPulseId: z.string().optional().nullable().describe('当前波形ID'),
}).describe('获取游戏信息响应格式');
export type GetGameInfoResponse = z.infer<typeof GetGameInfoResponseSchema>;

export const GetGameStrengthConfigResponseSchema = ApiResponseSchema.extend({
    strengthConfig: GameStrengthConfigSchema.optional().nullable().describe('游戏强度配置'),
}).describe('获取游戏强度配置响应格式');
export type GetGameStrengthConfigResponse = z.infer<typeof GetGameStrengthConfigResponseSchema>;

export const SetStrengthConfigRequestSchema = z.object({
    strength: z.object({
        add: AutoCastInt(z.number()).optional().describe('增加的强度'),
        sub: AutoCastInt(z.number()).optional().describe('减少的强度'),
        set: AutoCastInt(z.number()).optional().describe('设置的强度'),
    }).optional().describe('强度配置'),
    randomStrength: z.object({
        add: AutoCastInt(z.number()).optional().describe('增加的随机强度'),
        sub: AutoCastInt(z.number()).optional().describe('减少的随机强度'),
        set: AutoCastInt(z.number()).optional().describe('设置的随机强度'),
    }).optional().describe('随机强度配置'),
}).describe('设置强度配置请求');
export type SetStrengthConfigRequest = z.infer<typeof SetStrengthConfigRequestSchema>;

export const SetConfigResponseSchema = ApiResponseSchema.extend({
    successClientIds: z.array(ClientIdSchema).describe('成功设置强度的客户端ID列表'),
}).describe('设置强度配置响应');
export type SetConfigResponse = z.infer<typeof SetConfigResponseSchema>;

export const GetPulseIdResponseSchema = ApiResponseSchema.extend({
    currentPulseId: z.string().describe('当前波形ID'),
    pulseId: z.union([z.string(), z.array(z.string())])
        .describe('波形ID或ID列表'),
}).describe('获取游戏当前波形ID和波形播放列表');
export type GetPulseIdResponse = z.infer<typeof GetPulseIdResponseSchema>;

export const SetPulseIdRequestSchema = z.object({
    pulseId: z.union([z.string(), z.array(z.string())])
        .describe('要设置的波形ID或ID列表'),
}).describe('设置波形ID请求');
export type SetPulseIdRequest = z.infer<typeof SetPulseIdRequestSchema>;

export const GetPulseListResponseSchema = ApiResponseSchema.extend({
    pulseList: z.array(z.object({
        id: z.string().describe('波形ID'),
        name: z.string().describe('波形名称'),
    })).describe('波形ID列表'),
});
export type GetPulseListResponse = z.infer<typeof GetPulseListResponseSchema>;

export const StartFireActionRequestSchema = z.object({
    strength: AutoCastInt(z.number().int().min(0).max(200))
        .describe('一键开火的强度'),
    time: AutoCastInt(z.number().int().min(1)).optional()
        .describe('一键开火持续时间（毫秒）'),
    override: AutoCastBool(z.boolean()).optional().default(false)
        .describe('是否覆盖当前一键开火时间，为false时会累加时间'),
    pulseId: z.string().optional()
        .describe('一键开火的波形ID，如果不设置则使用当前波形'),
}).describe('一键开火请求');

export type StartFireActionRequest = z.infer<typeof StartFireActionRequestSchema>;