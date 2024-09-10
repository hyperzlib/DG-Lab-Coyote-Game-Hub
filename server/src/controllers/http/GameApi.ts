import { Context } from 'koa';
import { RouterContext } from 'koa-router';
import { CoyoteLiveGameManager } from '../../managers/CoyoteLiveGameManager';
import { GameStrengthConfig, MainGameConfig } from '../../types/game';
import { CoyoteLiveGame } from '../game/CoyoteLiveGame';
import { MainConfig } from '../../config';
import { DGLabPulseService } from '../../services/DGLabPulse';
import { asleep } from '../../utils/utils';
import { CoyoteGameConfigService, GameConfigType } from '../../services/CoyoteGameConfigService';
import { GameFireAction } from '../game/actions/GameFireAction';

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
    override?: boolean;
    pulseId?: string;
};

export class GameStrengthUpdateQueue {
    private queuedUpdates: Map<string, SetStrengthConfigRequest[]> = new Map();
    private runningQueue: Set<string> = new Set();

    public pushUpdate(clientId: string, update: SetStrengthConfigRequest) {
        if (!this.queuedUpdates.has(clientId)) {
            this.queuedUpdates.set(clientId, [
                update,
            ]);
        } else {
            this.queuedUpdates.get(clientId)!.push(update);
        }

        // 开始处理更新
        this.run(clientId);
    }

    public async run(clientId: string) {
        if (this.runningQueue.has(clientId)) {
            return;
        }

        this.runningQueue.add(clientId);
        let randomId = Math.random().toString(36).substring(6);
        while (this.queuedUpdates.get(clientId)) {
            // Merge updates
            const game = CoyoteLiveGameManager.instance.getGame(clientId);
            if (!game) { // 游戏不存在，可能是客户端断开连接
                this.queuedUpdates.delete(clientId);
                break;
            }

            let strengthConfig: GameStrengthConfig = { ...game.strengthConfig };
            const updates = this.queuedUpdates.get(clientId)!;

            let handledUpdateNum = 0;
            for (const update of updates) { // 遍历更新队列
                if (update.strength) {
                    let targetMinStrength = strengthConfig.strength;
                    if (typeof update.strength.add === 'number' || typeof update.strength.add === 'string') {
                        targetMinStrength += update.strength.add;
                    } else if (typeof update.strength.sub === 'number') {
                        targetMinStrength -= update.strength.sub;
                    } else if (typeof update.strength.set === 'number') {
                        targetMinStrength = update.strength.set;
                    }

                    strengthConfig.strength = targetMinStrength;
                }

                if (update.randomStrength) {
                    let targetMaxStrength = strengthConfig.randomStrength;
                    if (typeof update.randomStrength.add === 'number') {
                        targetMaxStrength += update.randomStrength.add;
                    } else if (typeof update.randomStrength.sub === 'number') {
                        targetMaxStrength -= update.randomStrength.sub;
                    } else if (typeof update.randomStrength.set === 'number') {
                        targetMaxStrength = update.randomStrength.set;
                    }

                    strengthConfig.randomStrength = targetMaxStrength;
                }
                
                handledUpdateNum++;
            }

            updates.splice(0, handledUpdateNum); // 移除已处理的更新

            // 防止强度配置超出范围
            strengthConfig.strength = Math.min(Math.max(0, strengthConfig.strength), game.clientStrength.limit);
            strengthConfig.randomStrength = Math.max(0, strengthConfig.randomStrength);

            // 更新游戏配置
            try {
                await game.updateStrengthConfig(strengthConfig);
            } catch (err: any) {
                console.error(`[GameStrengthUpdateQueue] Error while updating game config: ${err.message}`);
            }

            if (updates.length === 0) {
                // 如果队列为空，移除该客户端的更新队列
                this.queuedUpdates.delete(clientId);
            }

            await asleep(50); // 防止回跳
        }

        this.runningQueue.delete(clientId);
    }
}

const gameStrengthUpdateQueue = new GameStrengthUpdateQueue();

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

    public static async getGameStrength(ctx: RouterContext): Promise<void> {
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
            ctx.body = {
                status: 0,
                code: 'ERR::GAME_NOT_FOUND',
                message: '游戏进程不存在，可能是客户端未连接',
            };
            return;
        }

        ctx.body = {
            status: 1,
            code: 'OK',
            strengthConfig: game.strengthConfig,
        };
    }

    /**
     * 设置游戏强度
     * @param ctx 
     * @returns 
     */
    public static async setGameStrength(ctx: RouterContext): Promise<void> {
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

        // fix for x-www-form-urlencoded
        const postBody = ctx.request.body;
        for (const key1 in postBody) {
            if (typeof postBody[key1] === 'object') {
                for (const key2 in postBody[key1]) {
                    if (postBody[key1][key2]) {
                        postBody[key1][key2] = parseInt(postBody[key1][key2]);
                    }
                }
            }
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
            const req = postBody as SetStrengthConfigRequest;

            // 加入更新队列
            gameStrengthUpdateQueue.pushUpdate(game.clientId, req);

            successClientIds.add(game.clientId);
        }

        ctx.body = {
            status: 1,
            code: 'OK',
            message: `成功设置了 ${successClientIds.size} 个游戏的强度配置`,
            successClientIds: Array.from(successClientIds),
        };
    }

    /**
     * 获取当前波形
     * @param ctx 
     * @returns 
     */
    public static async getPulseId(ctx: RouterContext): Promise<void> {
        let clientId: string = '';
        if (ctx.params.id === 'all') {
            if (!MainConfig.value.allowBroadcastToClients) {
                ctx.body = {
                    status: 0,
                    code: 'ERR::BROADCAST_NOT_ALLOWED',
                    message: '当前服务器配置不允许向所有控制器广播指令',
                };
                return;
            }

            const game: CoyoteLiveGame = CoyoteLiveGameManager.instance.getGameList().next().value;
            clientId = game.clientId;
        } else {
            clientId = ctx.params.id;
        }
        
        if (!clientId) {
            ctx.body = {
                status: 0,
                code: 'ERR::GAME_NOT_FOUND',
                message: '游戏配置不存在，可能是控制器未连接',
            };
            return;
        }

        const gameConfig = await CoyoteGameConfigService.instance.get(clientId, GameConfigType.MainGame, false);
        if (!gameConfig) {
            ctx.body = {
                status: 0,
                code: 'ERR::GAME_NOT_FOUND',
                message: '游戏配置不存在，可能是控制器未连接',
            };
            return;
        }

        let currentPulseId = typeof gameConfig.pulseId === 'string' ? gameConfig.pulseId : gameConfig.pulseId[0];
        const game = CoyoteLiveGameManager.instance.getGame(clientId);
        if (game) {
            currentPulseId = game.pulsePlayList.getCurrentPulseId();
        }
        

        ctx.body = {
            status: 1,
            code: 'OK',
            currentPulseId,
            pulseId: gameConfig.pulseId,
        };
    }

    /**
     * 设置当前波形
     * @param ctx 
     * @returns 
     */
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

        const req = ctx.request.body as { pulseId: string | string[] };

        if (!req.pulseId) {
            ctx.body = {
                status: 0,
                code: 'ERR::INVALID_REQUEST',
                message: '无效的请求，需要 "pulseId" 参数',
            };
            return;
        }

        let clientIdList: string[] = [];
        if (ctx.params.id === 'all') { // 广播模式，设置所有游戏的强度配置
            if (!MainConfig.value.allowBroadcastToClients) {
                ctx.body = {
                    status: 0,
                    code: 'ERR::BROADCAST_NOT_ALLOWED',
                    message: '当前服务器配置不允许向所有客户端广播指令',
                };
                return;
            }

            const gameList = CoyoteLiveGameManager.instance.getGameList();
            for (const game of gameList) {
                clientIdList.push(game.clientId);
            }
        } else  { // 设置指定游戏的强度配置
            clientIdList.push(ctx.params.id);
        }
        
        let successClientIds = new Set<string>();
        for (const clientId of clientIdList) {
            CoyoteGameConfigService.instance.update(clientId, GameConfigType.MainGame, {
                pulseId: req.pulseId,
            });

            successClientIds.add(clientId);
        }

        ctx.body = {
            status: 1,
            code: 'OK',
            message: `成功设置了 ${successClientIds.size} 个游戏的波形ID`,
            successClientIds: Array.from(successClientIds),
        };
    }

    /**
     * 获取波形列表
     * @param ctx 
     */
    public static async getPulseList(ctx: RouterContext): Promise<void> {
        let pulseList: any[] = DGLabPulseService.instance.pulseList;

        if (ctx.params.id && ctx.params.id !== 'all') {
            const customPulseList = await CoyoteGameConfigService.instance.get(ctx.params.id, GameConfigType.CustomPulse, false);
            if (customPulseList) {
                pulseList.push(...customPulseList.customPulseList);
            }
        }
        
        // 是否获取完整的波形信息
        let isFullMode = ctx.request.query?.type === 'full';
        if (!isFullMode) {
            pulseList = pulseList.map(pulse => {
                return {
                    id: pulse.id,
                    name: pulse.name,
                };
            });
        }

        ctx.body = {
            status: 1,
            code: 'OK',
            pulseList,
        };
    }

    public static async startActionFire(ctx: RouterContext): Promise<void> {
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

        // fix for x-www-form-urlencoded
        const postBody = ctx.request.body;
        for (const key in postBody) {
            if (['strength', 'time'].includes(key) && postBody[key]) {
                postBody[key] = parseInt(postBody[key]);
            } else if (['override'].includes(key) && postBody[key]) {
                const val = postBody[key];
                postBody[key] = val === 'true' || val === '1';
            }
        }

        const req = postBody as FireRequest;

        if (typeof req.strength !== 'number') {
            ctx.body = {
                status: 0,
                code: 'ERR::INVALID_REQUEST',
                message: '无效的请求，需要 "strength" 参数',
            };
            return;
        }

        let warnings: { code: string, message: string }[] = [];
        if (req.strength > 30) {
            warnings.push({
                code: 'WARN::INVALID_STRENGTH',
                message: '一键开火强度值不能超过 30',
            });
        }

        const fireTime = req.time ?? 5000;

        if (fireTime > 30000) {
            warnings.push({
                code: 'WARN::INVALID_TIME',
                message: '一键开火时间不能超过 30000ms',
            });
        }

        const pulseId = req.pulseId ?? undefined;
        const overrideTime = req.override ?? false;

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
            let fireAction = new GameFireAction({
                strength: req.strength,
                time: fireTime,
                pulseId: pulseId,
                updateMode: overrideTime ? 'replace' : 'append',
            })
            await game.startAction(fireAction);

            successClientIds.add(game.clientId);
        }

        ctx.body = {
            status: 1,
            code: 'OK',
            message: `成功向 ${successClientIds.size} 个游戏发送了一键开火指令`,
            successClientIds: Array.from(successClientIds),
            warnings,
        };
    }
}