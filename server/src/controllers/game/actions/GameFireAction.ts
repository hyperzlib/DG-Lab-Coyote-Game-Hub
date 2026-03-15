import { Channel } from "#app/types/dg.js";
import { ChannelEnum, TargetChannelEnum } from "#app/types/game.js";
import { Channelify } from "../CoyoteGameController.js";
import { AbstractGameAction } from "./AbstractGameAction.js";

export type GameFireActionConfig = {
    /** 目标通道 */
    channel: TargetChannelEnum,
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
    /** 一键开火强度 */
    public fireStrength: number = 0;

    /** 一键开火结束时间 */
    public fireEndTimestamp: number = 0;

    /** 一键开火波形（可能是临时的） */
    public firePulseId: Channelify<string> = { main: '', channelB: '' };

    /** 当前一键开火的强度 */
    public currentFireStrength: Channelify<number> = { main: 0, channelB: 0 };

    public finished: Record<string, boolean> = {};

    initialize() {
        this.fireStrength = Math.min(this.config.strength, this.game.gameConfig.fireStrengthLimit || FIRE_MAX_STRENGTH);
        this.fireEndTimestamp = Date.now() + Math.min(this.config.time, FIRE_MAX_DURATION);

        // 初始化每个通道的完成状态
        let channels: ChannelEnum[] = ['main', 'channelB'];
        for (const channel of channels) {
            this.firePulseId[channel] = this.config.pulseId || this.game.gameConfig.pulse[channel].firePulseId ||
                this.game.pulsePlayList[channel]?.getCurrentPulseId() || '';

            if (this.config.channel === channel || this.config.channel === 'all') {
                this.finished[channel] = false;
            }
        }
    }

    async execute(channel: ChannelEnum, ab: AbortController, harvest: () => void): Promise<void> {
        let targetFireStrength = this.fireStrength;
        if (targetFireStrength === 0) {
            // 如果强度为0，直接标记为完成，不执行
            this.finished[channel] = true;
            this.game.setTempStrength(0, channel);
            return;
        }

        if (channel === 'channelB' && this.game.gameConfig.bChannelMode === 'off') {
            // B通道未启用时，直接标记为完成，不执行
            this.finished[channel] = true;
            this.game.setTempStrength(0, channel);
            return;
        }

        let clientChannel = Channel.A;
        if (channel === 'channelB') {
            clientChannel = Channel.B;
        }

        if (this.currentFireStrength[channel] === 0) {
            this.currentFireStrength[channel] = Math.min(targetFireStrength, SAFE_FIRE_STRENGTH);
        }
        this.game.setTempStrength(this.currentFireStrength[channel], channel);

        // 单轮最多输出30秒
        let outputTime = Math.min(this.fireEndTimestamp - Date.now(), 30000);

        let absoluteStrength = 0;
        absoluteStrength = Math.min(this.game.strengthConfig[channel].strength + this.currentFireStrength[channel],
            this.game.gameStrength[channel].limit);

        harvest();
        await this.game.setClientStrength(absoluteStrength, channel);

        // 如果目标强度大于初始强度，则逐渐增加强度
        let boostAb = new AbortController();

        ab.signal.addEventListener('abort', () => {
            boostAb.abort(); // 中断增加强度的任务
        }, { once: true });

        let setStrengthInterval = setInterval(() => {
            if (boostAb.signal.aborted) { // 任务被中断
                clearInterval(setStrengthInterval);
                return;
            }

            if (this.currentFireStrength[channel] >= targetFireStrength ||
                absoluteStrength >= this.game.clientStrength[channel].limit) {
                return; // 达到最大强度或限制，不再增加
            }

            if (targetFireStrength < this.currentFireStrength[channel]) {
                // 降低强度，直接设置
                this.game.setClientStrength(this.game.strengthConfig[channel].strength, channel).catch((error) => {
                    console.error('Failed to set strength:', error);
                });
            } else {
                // 逐渐增加强度
                this.currentFireStrength[channel] = Math.min(this.currentFireStrength[channel] + FIRE_BOOST_STRENGTH, targetFireStrength);
                this.game.setTempStrength(this.currentFireStrength[channel], channel);
                absoluteStrength = Math.min(this.game.strengthConfig[channel].strength + this.currentFireStrength[channel],
                    this.game.clientStrength[channel].limit);

                this.game.setClientStrength(absoluteStrength, channel).catch((error) => {
                    console.error('Failed to set strength:', error);
                });
            }
        }, 200);

        await this.game.client?.outputPulse(clientChannel, this.firePulseId[channel], outputTime, {
            abortController: ab,
            onTimeEnd: () => {
                boostAb.abort(); // 停止增加强度
                if (this.fireStrength && Date.now() > this.fireEndTimestamp) { // 一键开火结束
                    // 提前降低强度
                    this.game.setClientStrength(this.game.strengthConfig[channel].strength, channel).catch((error) => {
                        console.error('Failed to set strength:', error);
                    });
                }
            }
        });

        if (this.fireStrength && Date.now() > this.fireEndTimestamp) { // 一键开火结束
            this.game.setTempStrength(0, channel);
            this.finished[channel] = true;
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

        let channels: ChannelEnum[] = ['main', 'channelB'];
        for (const channel of channels) {
            if (config.pulseId) {
                this.firePulseId[channel] = this.config.pulseId || this.game.gameConfig.pulse[channel].firePulseId ||
                    this.game.pulsePlayList[channel]?.getCurrentPulseId() || '';
            }

            if (config.channel === channel || config.channel === 'all') {
                if (!this.finished[channel]) {
                    // 如果当前通道还未完成，重置完成状态以继续执行
                    this.finished[channel] = false;
                }
            }
        }
    }

    isApplicableToChannel(channel: ChannelEnum): boolean {
        if (this.config.channel === 'all') {
            return true;
        }
        return channel === this.config.channel;
    }

    public isFinished(): boolean {
        // 如果所有通道输出都已完成，或者当前时间超过结束时间，则认为动作已完成
        return Object.values(this.finished).every(f => f) || Date.now() > this.fireEndTimestamp;
    }
}