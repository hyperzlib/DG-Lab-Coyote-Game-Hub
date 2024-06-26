export interface RandomStrengthConfig {
    minStrength: number;
    maxStrength: number;
    minInterval: number;
    maxInterval: number;
    bChannelMultiplier?: number;
}

export interface CoyoteLiveGameConfig {
    strength: RandomStrengthConfig;
    pulseId: string;
}