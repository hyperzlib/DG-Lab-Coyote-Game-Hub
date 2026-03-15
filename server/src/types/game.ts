import { z } from 'koa-swagger-decorator';

export enum GameConfigType {
    MainGame = 'main-game',
    CustomPulse = 'custom-pulse',
}

export const PulsePlayModeSchema = z.enum(['single', 'sequence', 'random'])
export type PulsePlayMode = z.infer<typeof PulsePlayModeSchema>;


export const ChannelEnumSchema = z.enum(['main', 'channelB']).describe('通道枚举');
export type ChannelEnum = z.infer<typeof ChannelEnumSchema>;

export const TargetChannelEnumSchema = z.enum(['main', 'channelB', 'all']).describe('目标通道枚举');
export type TargetChannelEnum = z.infer<typeof TargetChannelEnumSchema>;

export const ChannelGameStrengthConfigSchema = z.object({
    strength: z.number().int().min(0).max(100).describe('基础强度'),
    randomStrength: z.number().int().min(0).max(100).describe('随机强度'),
}).describe('单通道强度配置');
export type ChannelGameStrengthConfig = z.infer<typeof ChannelGameStrengthConfigSchema>;

export const GameStrengthConfigSchema = z.object({
    main: ChannelGameStrengthConfigSchema.describe('A通道强度配置'),
    channelB: ChannelGameStrengthConfigSchema.describe('B通道强度配置'),
}).describe('强度配置');
export type GameStrengthConfig = z.infer<typeof GameStrengthConfigSchema>;

export const GamePulseConfigSchema = z.object({
    pulseId: z.union([z.string(), z.array(z.string())])
        .describe('波形ID或ID列表'),
    firePulseId: z.string().optional().nullable()
        .describe('一键开火波形ID，如果不设置则使用当前波形'),
    pulseMode: PulsePlayModeSchema.default('single')
        .describe('波形播放模式'),
    pulseChangeInterval: z.number().int().min(1).default(60)
        .describe('波形切换间隔，单位秒'),
}).describe('波形配置');
export type GamePulseConfig = z.infer<typeof GamePulseConfigSchema>;

export const MainGameConfigSchema = z.object({
    fireStrengthLimit: z.number().int().min(1).default(30)
        .describe('一键开火强度限制，默认30'),
    strengthChangeInterval: z.tuple([z.number().int().min(10), z.number().int().min(30)])
        .describe('强度变化间隔，单位秒'),
    bChannelMode: z.enum(['off', 'sync', 'discrete']).default('off')
        .describe('B通道模式，默认off，sync表示与A通道同步，discrete表示独立控制'),
    bChannelStrengthMultiplier: z.number().int().min(1).default(1)
        .describe('B通道相对于A通道的强度倍率，默认1'),
    pulse: z.object({
        main: GamePulseConfigSchema.describe('A通道波形配置'),
        channelB: GamePulseConfigSchema.describe('B通道波形配置'),
    }).describe('波形配置'),
}).describe('游戏主配置');
export type MainGameConfig = z.infer<typeof MainGameConfigSchema>;

export const GameConnectionConfigSchema = z.object({
    connectCodeList: z.array(z.string()).describe('游戏链接码列表'),
}).describe('游戏连接配置');
export type GameConnectionConfig = z.infer<typeof GameConnectionConfigSchema>;

export const PulseDataSchema = z.object({
    id: z.string().describe('波形ID'),
    name: z.string().describe('波形名称'),
    pulseData: z.array(z.string()).describe('波形数据'),
}).describe('波形数据');
export type PulseData = z.infer<typeof PulseDataSchema>;

export const GameCustomPulseConfigSchema = z.object({
    customPulseList: z.array(PulseDataSchema).describe('自定义波形列表'),
}).describe('游戏自定义波形配置');
export type GameCustomPulseConfig = z.infer<typeof GameCustomPulseConfigSchema>;
