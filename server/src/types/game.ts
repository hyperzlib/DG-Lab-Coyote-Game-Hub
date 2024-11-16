export type PulsePlayMode = 'single' | 'sequence' | 'random';

export interface GameStrengthConfig {
    strength: number;
    randomStrength: number;
}

export interface MainGameConfig {
    strengthChangeInterval: [number, number];

    enableBChannel: boolean;
    /** B通道强度倍率 */
    bChannelStrengthMultiplier: number;

    pulseId: string | string[];
    firePulseId?: string | null;

    pulseMode: PulsePlayMode;
    pulseChangeInterval: number;
}

export interface GameConnectionConfig {
    /** 游戏链接码 */
    connectCodeList: string[];
}

export interface GameCustomPulseConfig {
    customPulseList: any[];
}