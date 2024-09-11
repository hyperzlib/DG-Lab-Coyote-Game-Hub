import { AbstractGameAction } from "./AbstractGameAction";

export type GameFireActionConfig = {
    /** 一键开火的强度 */
    strength: number;
    /** 一键开火的持续时间（毫秒） */
    time: number;
    /** 指定波形ID */
    pulseId?: string;
    /** 重复操作的模式 */
    updateMode: "replace" | "append";
};

export const FIRE_MAX_STRENGTH = 30;
export const FIRE_MAX_DURATION = 30000;

export class GameFireAction extends AbstractGameAction<GameFireActionConfig> {
    /** 一键开火强度 */
    public fireStrength: number = 0;

    /** 一键开火结束时间 */
    public fireEndTimestamp: number = 0;

    /** 一键开火波形（可能是临时的） */
    public firePulseId: string = '';

    initialize() {
        this.fireStrength = Math.min(this.config.strength, FIRE_MAX_STRENGTH);
        this.fireEndTimestamp = Date.now() + Math.min(this.config.time, FIRE_MAX_DURATION);
        this.firePulseId = this.config.pulseId || this.game.gameConfig.firePulseId || this.game.pulsePlayList.getCurrentPulseId();

        this.game.tempStrength = this.fireStrength;
    }

    async execute(ab: AbortController, harvest: () => void, done: () => void): Promise<void> {
        let strength = Math.min(this.game.strengthConfig.strength + this.fireStrength, this.game.gameStrength.limit);
        let outputTime = Math.min(this.fireEndTimestamp - Date.now(), 30000); // 单次最多输出30秒

        await this.game.setClientStrength(strength);

        await this.game.client?.outputPulse(this.firePulseId, outputTime, {
            abortController: ab,
            bChannel: this.game.gameConfig.enableBChannel,
            onTimeEnd: () => {
                if (this.fireStrength && Date.now() > this.fireEndTimestamp) { // 一键开火结束
                    // 提前降低强度
                    this.game.setClientStrength(this.game.strengthConfig.strength).catch((error) => {
                        console.error('Failed to set strength:', error);
                    });
                }
            }
        });

        if (this.fireStrength && Date.now() > this.fireEndTimestamp) { // 一键开火结束
            this.game.tempStrength = 0;
            done();
        }
    }

    updateConfig(config: GameFireActionConfig): void {
        this.config = config;

        if (config.strength) {
            this.fireStrength = Math.min(config.strength, FIRE_MAX_STRENGTH);
            const strength = this.game.strengthConfig.strength + this.fireStrength;
            this.game.setClientStrength(strength).catch((error) => {
                console.error('Failed to set strength:', error);
            });
        }
    }
}