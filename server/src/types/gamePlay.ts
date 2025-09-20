import { z } from "koa-swagger-decorator";
import { GameStrengthConfigSchema } from "./game.js";

export const GamePlayProviderInfoSchema = z.object({
    providerId: z.string().optional().nullable().describe('提供者（插件）ID'),
    providerName: z.string().optional().nullable().describe('提供者（插件）名称'),
    providerIcon: z.string().optional().nullable().describe('提供者（插件）图标'),
}).describe('游戏玩法Provider信息');
export type GamePlayProviderInfo = z.infer<typeof GamePlayProviderInfoSchema>;

export const GamePlayConfigSchema = z.object({
    id: z.string().describe('配置项ID'),
    title: z.string().describe('配置项显示名'),
    inputType: z.enum(['text', 'int', 'float', 'select', 'checkbox'])
        .describe('配置项输入类型'),
    inputOptions: z.array(z.string()).optional().nullable()
        .describe('配置项输入选项，仅在inputType为select时有效'),
    defaultValue: z.any().describe('配置项默认值'),
    helpText: z.string().optional().nullable()
        .describe('配置项帮助文本'),
});
export type GamePlayConfigType = z.infer<typeof GamePlayConfigSchema>;

export const GamePlayConfigListSchema = z.array(GamePlayConfigSchema).describe('游戏配置项声明列表');
export type GamePlayConfigListType = z.infer<typeof GamePlayConfigListSchema>;

export const GamePlayEventSchema = z.object({
    id: z.string().describe('事件ID'),
    title: z.string().describe('事件名'),
    description: z.string().optional().nullable()
        .describe('事件描述'),
    eventType: z.enum(['simple', 'percent']),
}).describe('游戏事件列表');
export type GamePlayEventType = z.infer<typeof GamePlayEventSchema>;

export const GamePlayEventListSchema = z.array(GamePlayEventSchema).describe('游戏事件声明列表');
export type GamePlayEventListType = z.infer<typeof GamePlayEventListSchema>;

export const GamePlayApiActionSourceSchema = z.object({
    type: z.literal('api').describe('动作来源类型'),
    comment: z.string().optional().nullable()
        .describe('动作来源注释'),
});

export const GamePlayEventActionSourceSchema = z.object({
    type: z.literal('event').describe('动作来源类型'),
    eventId: z.string().describe('事件ID'),
    params: z.array(z.number()).optional().nullable(),
    comment: z.string().optional().nullable()
        .describe('动作来源注释'),
}).describe('事件动作来源');

export const GamePlayActionSourceSchema = z.union([
    GamePlayApiActionSourceSchema,
    GamePlayEventActionSourceSchema,
]).describe('游戏动作来源');
export type GamePlayActionSource = z.infer<typeof GamePlayActionSourceSchema>;

export const GamePlayLogBaseSchema = z.object({
    timestamp: z.number().int().describe('日志时间戳'),
    source: GamePlayActionSourceSchema.optional().nullable()
        .describe('日志来源，可能是API调用或事件触发'),
}).describe('游戏动作日志基础结构');

export const GamePlayUpdateStrengthLogSchema = GamePlayLogBaseSchema.extend({
    type: z.literal('updateStrength').describe('日志类型'),
    strengthConfig: GameStrengthConfigSchema,
}).describe('游戏强度更新日志');
export type GamePlayUpdateStrengthLogType = z.infer<typeof GamePlayUpdateStrengthLogSchema>;

export const GamePlayActionLogSchema = GamePlayLogBaseSchema.extend({
    type: z.enum(['startAction', 'stopAction']).describe('日志类型'),
    actionId: z.string().describe('动作ID'),
    actionName: z.string().describe('动作名称'),
    data: z.any().describe('动作数据'),
}).describe('游戏动作执行日志');
export type GamePlayActionLogType = z.infer<typeof GamePlayActionLogSchema>;

export const GamePlayLogSchema = z.union([
    GamePlayUpdateStrengthLogSchema,
    GamePlayActionLogSchema,
]).describe('游戏动作日志');
export type GamePlayLogType = z.infer<typeof GamePlayLogSchema>;

export const GamePlayEventActionSetStrengthSchema = z.object({
    type: z.enum(['addStrength', 'subStrength', 'setStrength']).describe('事件动作类型'),
    strength: z.number().int().describe('强度值'),
}).describe('游戏事件动作-设置强度');
export type GamePlayEventActionSetStrengthType = z.infer<typeof GamePlayEventActionSetStrengthSchema>;

export const GamePlayEventActionFireActionSchema = z.object({
    type: z.literal('fireAction').describe('事件动作类型'),
    strength: z.number().int().describe('强度值'),
    duration: z.number().int().describe('持续时间'),
    isOverrideMode: z.boolean().default(false).describe('重复触发时是否覆盖持续时间'),
}).describe('游戏事件动作-一键开火');
export type GamePlayEventActionFireActionType = z.infer<typeof GamePlayEventActionFireActionSchema>;

export const GamePlayEventActionSetStrength2DSchema = z.object({
    type: z.literal('setStrength2D').describe('事件动作类型'),
    strengthCurve: z.array(z.number().int()).describe('强度曲线'),
}).describe('游戏事件动作-设置强度2D');
export type GamePlayEventActionSetStrength2DType = z.infer<typeof GamePlayEventActionSetStrength2DSchema>;

export const GamePlayEventActionSchema = z.union([
    GamePlayEventActionSetStrengthSchema,
    GamePlayEventActionFireActionSchema,
    GamePlayEventActionSetStrength2DSchema,
]).describe('游戏事件动作');
export type GamePlayEventAction = z.infer<typeof GamePlayEventActionSchema>;