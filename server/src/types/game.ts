export interface GameStrengthConfig {
    strength: number;
    randomStrength: number;
    minInterval: number;
    maxInterval: number;
    bChannelMultiplier?: number;
}

export interface CoyoteLiveGameConfig {
    strength: GameStrengthConfig;
    pulseId: string;
    firePulseId?: string | null;
}