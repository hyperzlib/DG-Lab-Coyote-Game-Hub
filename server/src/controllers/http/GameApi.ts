import { Context } from 'koa';
import { RouterContext } from 'koa-router';
import { CoyoteLiveGameManager } from '../../managers/CoyoteLiveGameManager';
import { CoyoteLiveGameConfig } from '../../types/game';
import { CoyoteLiveGame } from '../game/CoyoteLiveGame';
import { MainConfig } from '../../config';
import { DGLabPulseService } from '../../services/DGLabPulse';

export type SetStrengthConfigRequest = {
    strength?: {
        add?: number;
        sub?: number;
        set?: number;
    },
    randomStrength?: {
        add?: number;
        sub?: number;
        set?: number;
    },
    minInterval?: {
        set?: number;
    },
    maxInterval?: {
        set?: number;
    },
};

export type FireRequest = {
    strength: number;
    time?: number;
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

    public static async gameApiInfo(ctx: RouterContext): Promise<void> {
        ctx.body = {
            status: 1,
            code: 'OK',
            message: 'Coyote Live 游戏API',
            minApiVersion: 1,
            maxApiVersion: 1,
        };
    };

    public static async gameInfo(ctx: RouterContext): Promise<void> {
        let game: CoyoteLiveGame | null = null;
        if (ctx.params.id === 'all') {
            if (!MainConfig.value.allowBroadcastToClients) {
                ctx.body = {
                    status: 0,
                    code: 'ERR::BROADCAST_NOT_ALLOWED',
                    message: '当前服务器配置不允许向所有客户端广播指令',
                };
                return;
            }
            
            game = CoyoteLiveGameManager.instance.getGameList().next().value;
        } else {
            game = await GameApiController.requestGameInstance(ctx);
        }

        if (game) {
            ctx.body = {
                status: 1,
                code: 'OK',
                clientType: game.clientType,
                gameConfig: game.gameConfig,
                clientStrength: game.clientStrength,
            };
        } else {
            ctx.body = {
                status: 0,
                code: 'ERR::GAME_NOT_FOUND',
                message: '游戏进程不存在，可能是客户端未连接',
            };
        }
    }

    public static async getStrengthConfig(ctx: RouterContext): Promise<void> {
        let game: CoyoteLiveGame | null = null;
        if (ctx.params.id === 'all') {
            if (!MainConfig.value.allowBroadcastToClients) {
                ctx.body = {
                    status: 0,
                    code: 'ERR::BROADCAST_NOT_ALLOWED',
                    message: '当前服务器配置不允许向所有客户端广播指令',
                };
                return;
            }

            game = CoyoteLiveGameManager.instance.getGameList().next().value;
        } else {
            game = await GameApiController.requestGameInstance(ctx);
        }
        
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

        let successClientIds = new Set<string>();
        for (const game of gameList) {
            const req = ctx.request.body as SetStrengthConfigRequest;

            let strengthConfig = { ...game.gameConfig.strength };
            
            if (req.strength) {
                let targetMinStrength = strengthConfig.strength;
                if (typeof req.strength.add === 'number') {
                    targetMinStrength += req.strength.add;
                } else if (typeof req.strength.sub === 'number') {
                    targetMinStrength -= req.strength.sub;
                } else if (typeof req.strength.set === 'number') {
                    targetMinStrength = req.strength.set;
                }

                strengthConfig.strength = targetMinStrength;
            }

            if (req.randomStrength) {
                let targetMaxStrength = strengthConfig.randomStrength;
                if (typeof req.randomStrength.add === 'number') {
                    targetMaxStrength += req.randomStrength.add;
                } else if (typeof req.randomStrength.sub === 'number') {
                    targetMaxStrength -= req.randomStrength.sub;
                } else if (typeof req.randomStrength.set === 'number') {
                    targetMaxStrength = req.randomStrength.set;
                }

                strengthConfig.randomStrength = targetMaxStrength;
            }

            if (typeof req.minInterval?.set === 'number') {
                strengthConfig.minInterval = req.minInterval.set;
            }

            if (typeof req.maxInterval?.set === 'number') {
                strengthConfig.maxInterval = req.maxInterval.set;
            }

            // 防止强度配置超出范围
            strengthConfig.strength = Math.min(Math.max(0, strengthConfig.strength), game.clientStrength.limit);
            strengthConfig.randomStrength = Math.max(0, strengthConfig.randomStrength);
            strengthConfig.minInterval = Math.max(0, strengthConfig.minInterval);
            strengthConfig.maxInterval = Math.max(0, strengthConfig.maxInterval);

            // 更新游戏配置
            game.updateConfig({
                ...game.gameConfig,
                strength: strengthConfig,
            });

            successClientIds.add(game.clientId);
        }

        ctx.body = {
            status: 1,
            code: 'OK',
            message: `成功设置了 ${successClientIds.size} 个游戏的强度配置`,
            successClientIds: Array.from(successClientIds),
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
        })

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
            ctx.body = {
                status: 0,
                code: 'ERR::GAME_NOT_FOUND',
                message: '游戏进程不存在，可能是客户端未连接',
            };
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

    public static async fire(ctx: RouterContext): Promise<void> {
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

        const req = ctx.request.body as FireRequest;

        if (typeof req.strength !== 'number') {
            ctx.body = {
                status: 0,
                code: 'ERR::INVALID_REQUEST',
                message: '无效的请求，需要 "strength" 参数',
            };
            return;
        }

        if (req.strength > 30) {
            ctx.body = {
                status: 0,
                code: 'ERR::INVALID_STRENGTH',
                message: '一键开火强度值不能超过 30',
            };
            return;
        }

        const fireTime = req.time ?? 5000;

        if (fireTime > 30000) {
            ctx.body = {
                status: 0,
                code: 'ERR::INVALID_TIME',
                message: '一键开火时间不能超过 30000ms',
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

        let successClientIds = new Set<string>();
        for (const game of gameList) {
            game.fire(req.strength, fireTime);

            successClientIds.add(game.clientId);
        }

        ctx.body = {
            status: 1,
            code: 'OK',
            message: `成功向 ${successClientIds.size} 个游戏发送了一键开火指令`,
            successClientIds: Array.from(successClientIds),
        };
    }
}