import { AbstractGameAction } from "./AbstractGameAction.js";

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

export const SAFE_FIRE_STRENGTH = 30; // 一键开火首次强度
export const FIRE_BOOST_STRENGTH = 5; // 一键开火每次增加的强度

export const FIRE_MAX_STRENGTH = 200;
export const FIRE_MAX_DURATION = 300000;

export class GameFireAction extends AbstractGameAction<GameFireActionConfig> {
    public static readonly actionId = "fire";
    public static readonly actionName = "一键开火";

    /** 一键开火强度 */
    public fireStrength: number = 0;

    /** 一键开火结束时间 */
    public fireEndTimestamp: number = 0;

    /** 一键开火波形（可能是临时的） */
    public firePulseId: string = '';

    /** 当前一键开火的强度 */
    public currentFireStrength: number = 0;

    initialize() {
        this.fireStrength = Math.min(this.config.strength, this.game.gameConfig.fireStrengthLimit || FIRE_MAX_STRENGTH);
        this.fireEndTimestamp = Date.now() + Math.min(this.config.time, FIRE_MAX_DURATION);
        this.firePulseId = this.config.pulseId || this.game.gameConfig.firePulseId || this.game.pulsePlayList.getCurrentPulseId();

        this.game.tempStrength = Math.min(this.fireStrength, SAFE_FIRE_STRENGTH);
    }

    async execute(ab: AbortController, harvest: () => void, done: () => void): Promise<void> {
        this.currentFireStrength = Math.min(this.fireStrength, SAFE_FIRE_STRENGTH);
        this.game.tempStrength = this.currentFireStrength;

        let absoluteStrength = 0;

        let outputTime = Math.min(this.fireEndTimestamp - Date.now(), 30000); // 单次最多输出30秒

        absoluteStrength = Math.min(this.game.strengthConfig.strength + this.currentFireStrength, this.game.gameStrength.limit);
        await this.game.setClientStrength(absoluteStrength);

        // 如果目标强度大于初始强度，则逐渐增加强度
        let boostAb = new AbortController();

        ab.signal.addEventListener('abort', () => {
            boostAb.abort(); // 中断增加强度的任务
        });
        
        let setStrengthInterval = setInterval(() => {
            if (boostAb.signal.aborted) { // 任务被中断
                clearInterval(setStrengthInterval);
                return;
            }

            if (this.currentFireStrength >= this.fireStrength || absoluteStrength >= this.game.clientStrength.limit) {
                return; // 达到最大强度或限制，不再增加
            }

            if (this.fireStrength < this.currentFireStrength) {
                // 降低强度，直接设置
                this.game.setClientStrength(this.game.strengthConfig.strength).catch((error) => {
                    console.error('Failed to set strength:', error);
                });
            } else {
                // 逐渐增加强度
                this.currentFireStrength = Math.min(this.currentFireStrength + FIRE_BOOST_STRENGTH, this.fireStrength);
                this.game.tempStrength = this.currentFireStrength;
                absoluteStrength = Math.min(this.game.strengthConfig.strength + this.currentFireStrength, this.game.clientStrength.limit);

                this.game.setClientStrength(absoluteStrength).catch((error) => {
                    console.error('Failed to set strength:', error);
                });
            }
        }, 200);

        await this.game.client?.outputPulse(this.firePulseId, outputTime, {
            abortController: ab,
            bChannel: this.game.gameConfig.enableBChannel,
            onTimeEnd: () => {
                boostAb.abort(); // 停止增加强度
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
            this.fireStrength = Math.min(config.strength, this.game.gameConfig.fireStrengthLimit || FIRE_MAX_STRENGTH);
        }

        if (config.updateMode === 'replace') {
            this.fireEndTimestamp = Date.now() + Math.min(config.time, FIRE_MAX_DURATION);
        } else if (config.updateMode === 'append') {
            this.fireEndTimestamp += Math.min(config.time, FIRE_MAX_DURATION);
        }

        if (config.pulseId) {
            this.firePulseId = config.pulseId;
        }
    }
}