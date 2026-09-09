import { CoyoteGameConfigService, GameConfigType } from './CoyoteGameConfigService.js';
import { DGLabPulseService } from './DGLabPulse.js';
import { FIRE_MAX_DURATION } from '../controllers/game/actions/GameFireAction.js';
import type { DGLabPulseInfo } from './DGLabPulse.js';
import type { ChannelEnum, MainGameConfig, TargetChannelEnum } from '../types/game.js';

export type FireActionWarning = {
    code: string;
    message: string;
};

export type NormalizedFireAction = {
    actualDuration: number;
    updateMode: 'replace' | 'append';
    warnings: FireActionWarning[];
};

export type FireChannelRestriction = {
    code: 'ERR::B_CHANNEL_NOT_INDEPENDENT';
    message: string;
};

/** B 通道只有独立模式允许单独发起一键开火。 */
export function getFireChannelRestriction(
    channel: TargetChannelEnum,
    bChannelMode: MainGameConfig['bChannelMode'],
): FireChannelRestriction | undefined {
    if (channel !== 'channelB' || bChannelMode === 'discrete') {
        return undefined;
    }

    if (bChannelMode === 'off') {
        return {
            code: 'ERR::B_CHANNEL_NOT_INDEPENDENT',
            message: 'B 通道当前已关闭，不能单独发起一键开火。请先将 B 通道设置为独立模式。',
        };
    }

    return {
        code: 'ERR::B_CHANNEL_NOT_INDEPENDENT',
        message: 'B 通道当前为同步模式，不能单独发起一键开火。请先将 B 通道设置为独立模式。',
    };
}

function uniquePulsesById(pulses: DGLabPulseInfo[]): DGLabPulseInfo[] {
    const pulseIds = new Set<string>();
    return pulses.filter((pulse) => {
        if (pulseIds.has(pulse.id)) {
            return false;
        }
        pulseIds.add(pulse.id);
        return true;
    });
}

/**
 * 返回服务器内置波形和指定游戏的自定义波形。
 * 使用新数组，避免把自定义波形追加到全局内置列表中。
 */
export async function getAvailableGamePulses(clientId?: string): Promise<DGLabPulseInfo[]> {
    const pulses = [...DGLabPulseService.instance.pulseList];

    if (!clientId) {
        return uniquePulsesById(pulses);
    }

    const customPulseConfig = await CoyoteGameConfigService.instance.get(
        clientId,
        GameConfigType.CustomPulse,
        false,
    );

    if (!customPulseConfig) {
        return uniquePulsesById(pulses);
    }

    return uniquePulsesById([...pulses, ...customPulseConfig.customPulseList]);
}

/** 更新指定游戏指定通道的波形播放列表。 */
export async function setGamePulse(
    clientId: string,
    channel: ChannelEnum,
    pulseId: MainGameConfig['pulse'][ChannelEnum]['pulseId'],
): Promise<void> {
    await CoyoteGameConfigService.instance.update(clientId, GameConfigType.MainGame, {
        pulse: {
            [channel]: { pulseId },
        },
    });
}

/**
 * 统一旧版 API 和 MCP API 的开火时长及覆盖模式。
 * 时长超过动作上限时截断，并保留警告让调用方写回响应。
 */
export function normalizeFireAction(fireTime: number, override: boolean): NormalizedFireAction {
    const warnings: FireActionWarning[] = [];
    const numericTime = Number.isFinite(fireTime) ? Math.trunc(fireTime) : 0;

    if (numericTime > FIRE_MAX_DURATION) {
        warnings.push({
            code: 'WARN::INVALID_TIME',
            message: `一键开火时间不能超过 ${FIRE_MAX_DURATION}ms`,
        });
    }

    if (numericTime < 1) {
        warnings.push({
            code: 'WARN::INVALID_TIME',
            message: '一键开火时间必须大于 0ms',
        });
    }

    return {
        actualDuration: Math.min(Math.max(numericTime, 1), FIRE_MAX_DURATION),
        updateMode: override ? 'replace' : 'append',
        warnings,
    };
}
