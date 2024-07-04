import { Context } from 'koa';
import { RouterContext } from 'koa-router';
import { CoyoteLiveGameManager } from '../../managers/CoyoteLiveGameManager';
import { CoyoteLiveGameConfig } from '../../types/game';
import { CoyoteLiveGame } from '../game/CoyoteLiveGame';
import { MainConfig } from '../../config';
import { DGLabPulseService } from '../../services/DGLabPulse';

export type SetStrengthConfigRequest = {
    minStrength?: {
        add?: number;
        sub?: number;
        set?: number;
    },
    maxStrength?: {
        add?: number;
        sub?: number;
        set?: number;
        keep?: boolean;
    },
    minInterval?: {
        set?: number;
    },
    maxInterval?: {
        set?: number;
    },
};

export class GameApiController {
    private static async requestGameInstance(ctx: RouterContext): Promise<CoyoteLiveGame | null> {
        if (!ctx.params.id) {
            ctx.body = {
                status: 0,
                code: 'ERR::INVALID_CLIENT_ID',
                message: '无效的客户端ID',
            };
            return null;
        }

        const game = CoyoteLiveGameManager.instance.getGame(ctx.params.id);
        if (!game) {
            ctx.body = {
                status: 0,
                code: 'ERR::GAME_NOT_FOUND',
                message: '游戏进程不存在，可能是客户端未连接',
            };
            return null;
        }

        return game;
    }

    public static async gameInfo(ctx: RouterContext): Promise<void> {
        const game = await GameApiController.requestGameInstance(ctx);
        if (!game) {
            return;
        }

        if (game) {
            ctx.body = {
                status: 1,
                code: 'OK',
                gameConfig: game.gameConfig,
                clientStrength: game.clientStrength,
            };
        }
    }

    public static async getStrengthConfig(ctx: RouterContext): Promise<void> {
        const game = await GameApiController.requestGameInstance(ctx);
        if (!game) {
            return;
        }

        ctx.body = {
            status: 1,
            code: 'OK',
            strengthConfig: game.gameConfig.strength,
        };
    }

    public static async setStrengthConfig(ctx: RouterContext): Promise<void> {
        if (!ctx.params.id) {
            ctx.body = {
                status: 0,
                code: 'ERR::INVALID_CLIENT_ID',
                message: '无效的客户端ID',
            };
            return;
        }

        if (!ctx.request.body || Object.keys(ctx.request.body).length === 0) {
            ctx.body = {
                status: 0,
                code: 'ERR::INVALID_REQUEST',
                message: '无效的请求，参数为空',
            };
            return;
        }

        let gameList: Iterable<CoyoteLiveGame> = [];
        if (ctx.params.id === 'all') { // 广播模式，设置所有游戏的强度配置
            if (!MainConfig.value.allowBroadcastToClients) {
                ctx.body = {
                    status: 0,
                    code: 'ERR::BROADCAST_NOT_ALLOWED',
                    message: '当前服务器配置不允许向所有客户端广播指令',
                };
                return;
            }

            gameList = CoyoteLiveGameManager.instance.getGameList();
        } else  { // 设置指定游戏的强度配置
            const game = CoyoteLiveGameManager.instance.getGame(ctx.params.id);
            if (!game) {
                ctx.body = {
                    status: 0,
                    code: 'ERR::GAME_NOT_FOUND',
                    message: '游戏进程不存在，可能是客户端未连接',
                };
                return;
            }

           (gameList as CoyoteLiveGame[]).push(game);
        }

        let successNum = 0;
        for (const game of gameList) {
            const req = ctx.request.body as SetStrengthConfigRequest;

            let strengthConfig = { ...game.gameConfig.strength };
            let autoMaxStrength = !req.maxStrength?.keep;

            if (req.minStrength) {
                let targetMinStrength = strengthConfig.minStrength;
                if (typeof req.minStrength.add === 'number') {
                    targetMinStrength += req.minStrength.add;
                } else if (typeof req.minStrength.sub === 'number') {
                    targetMinStrength -= req.minStrength.sub;
                } else if (typeof req.minStrength.set === 'number') {
                    targetMinStrength = req.minStrength.set;
                }

                if (autoMaxStrength) {
                    let deltaStrength = targetMinStrength - strengthConfig.minStrength;
                    strengthConfig.maxStrength += deltaStrength;
                }

                strengthConfig.minStrength = targetMinStrength;
            }

            if (req.maxStrength) {
                let targetMaxStrength = strengthConfig.maxStrength;
                if (typeof req.maxStrength.add === 'number') {
                    targetMaxStrength += req.maxStrength.add;
                } else if (typeof req.maxStrength.sub === 'number') {
                    targetMaxStrength -= req.maxStrength.sub;
                } else if (typeof req.maxStrength.set === 'number') {
                    targetMaxStrength = req.maxStrength.set;
                }

                strengthConfig.maxStrength = targetMaxStrength;
            }

            if (typeof req.minInterval?.set === 'number') {
                strengthConfig.minInterval = req.minInterval.set;
            }

            if (typeof req.maxInterval?.set === 'number') {
                strengthConfig.maxInterval = req.maxInterval.set;
            }

            // 防止强度配置超出范围
            strengthConfig.minStrength = Math.min(
                Math.max(0, strengthConfig.minStrength),
                game.clientStrength.limit);

                strengthConfig.maxStrength = Math.min(
                Math.max(strengthConfig.minStrength, strengthConfig.maxStrength),
                game.clientStrength.limit);

            // 更新游戏配置
            game.updateConfig({
                ...game.gameConfig,
                strength: strengthConfig,
            });

            successNum ++;
        }

        ctx.body = {
            status: 1,
            code: 'OK',
            message: `成功设置了 ${successNum} 个游戏的强度配置`,
            successNum: successNum,
        };
    }

    public static async getPulseId(ctx: RouterContext): Promise<void> {
        const game = await GameApiController.requestGameInstance(ctx);
        if (!game) {
            return;
        }

        ctx.body = {
            status: 1,
            code: 'OK',
            pulseId: game.gameConfig.pulseId,
        };
    }

    public static async setPulseId(ctx: RouterContext): Promise<void> {
        if (!ctx.params.id) {
            ctx.body = {
                status: 0,
                code: 'ERR::INVALID_CLIENT_ID',
                message: '无效的客户端ID',
            };
            return;
        }

        if (!ctx.request.body || Object.keys(ctx.request.body).length === 0) {
            ctx.body = {
                status: 0,
                code: 'ERR::INVALID_REQUEST',
                message: '无效的请求，参数为空',
            };
            return;
        }

        const game = CoyoteLiveGameManager.instance.getGame(ctx.params.id);
        if (!game) {
            ctx.body = {
                status: 0,
                code: 'ERR::GAME_NOT_FOUND',
                message: '游戏进程不存在，可能是客户端未连接',
            };
            return;
        }

        const req = ctx.request.body as { pulseId: string };

        if (!req.pulseId) {
            ctx.body = {
                status: 0,
                code: 'ERR::INVALID_REQUEST',
                message: '无效的请求，需要 "pulseId" 参数',
            };
            return;
        }

        game.updateConfig({
            ...game.gameConfig,
            pulseId: req.pulseId,
        });

        ctx.body = {
            status: 1,
            code: 'OK',
            message: '成功设置了游戏的脉冲ID',
        };
    }


    public static async getPulseList(ctx: RouterContext): Promise<void> {
        // 关于为什么脉冲列表要根据游戏获取，是为了在将来适配DG Helper的情况下，用于获取DG-Lab内置的脉冲列表
        let game = await GameApiController.requestGameInstance(ctx); // 用于检查游戏是否存在
        if (!game) {
            return;
        }

        // 暂且只从配置文件中获取脉冲列表
        const pulseList = DGLabPulseService.instance.pulseList.map((pulse) => ({
            id: pulse.id,
            name: pulse.name,
        }));

        ctx.body = {
            status: 1,
            code: 'OK',
            pulseList: pulseList,
        };
    }
}