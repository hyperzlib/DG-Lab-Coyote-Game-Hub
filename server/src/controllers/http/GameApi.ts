import { RouterContext } from 'koa-router';
import { CoyoteLiveGameManager } from '../../managers/CoyoteLiveGameManager';
import { CoyoteLiveGame } from '../game/CoyoteLiveGame';
import { DGLabPulseService } from '../../services/DGLabPulse';
import { asleep } from '../../utils/utils';

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

export interface BaseResponse {
    status: Status;
    code: Code;
}

export enum Status {
    Error = 0,
    Ok = 1,
}

export enum Code {
    Ok = 'OK',
    ErrInvalidClientId = 'ERR::INVALID_CLIENT_ID',
    ErrInvalidPulseId = 'ERR::INVALID_PULSE_ID',
    ErrGameNotFound = 'ERR::GAME_NOT_FOUND',
    ErrInvalidRequest = 'ERR::INVALID_REQUEST',
    ErrBroadcastNotAllowed = 'ERR::BROADCAST_NOT_ALLOWED',
}

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
        // let randomId = Math.random().toString(36).substring(6); // usused
        while (this.queuedUpdates.get(clientId)) {
            // Merge updates
            const game = CoyoteLiveGameManager.instance.getGame(clientId);
            if (!game) { // 游戏不存在，可能是客户端断开连接
                this.queuedUpdates.delete(clientId);
                break;
            }

            let strengthConfig = { ...game.gameConfig.strength };
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

                if (typeof update.minInterval?.set === 'number') {
                    strengthConfig.minInterval = update.minInterval.set;
                }

                if (typeof update.maxInterval?.set === 'number') {
                    strengthConfig.maxInterval = update.maxInterval.set;
                }

                handledUpdateNum++;
            }

            updates.splice(0, handledUpdateNum); // 移除已处理的更新

            // 防止强度配置超出范围
            strengthConfig.strength = Math.min(Math.max(0, strengthConfig.strength), game.clientStrength.limit);
            strengthConfig.randomStrength = Math.max(0, strengthConfig.randomStrength);
            strengthConfig.minInterval = Math.max(0, strengthConfig.minInterval);
            strengthConfig.maxInterval = Math.max(0, strengthConfig.maxInterval);

            // 更新游戏配置
            try {
                await game.updateConfig({
                    ...game.gameConfig,
                    strength: strengthConfig,
                });
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
    private static getGlobalPulseList(fullMode: boolean): any[] {
        let pulseList: any[] = [];

        if (fullMode) {
            pulseList = DGLabPulseService.instance.pulseList;
        } else {
            // 只返回基本信息
            pulseList = DGLabPulseService.instance.getPulseInfoList();
        }

        return pulseList;
    }

    public static setResponse<T extends BaseResponse>(ctx: RouterContext, body: T) {
        ctx.body = body;
        ctx.status = 200;
        ctx.type = 'application/json';
        ctx.set('app-status', body.status.toString());
        ctx.set('app-code', body.code);
    }

    public static setResponseOk<T extends object>(ctx: RouterContext, payload: Omit<T, keyof BaseResponse>) {
        const baseResponse = {
            status: Status.Ok,
            code: Code.Ok,
        };
        const body = { ...baseResponse, ...payload };

        GameApiController.setResponse(ctx, body);
    }

    public static async gameApiInfo(ctx: RouterContext): Promise<void> {
        GameApiController.setResponseOk(ctx, {
            message: 'Coyote Live 游戏API',
            minApiVersion: 1,
            maxApiVersion: 1,
        });
    };

    public static async gameInfo(ctx: RouterContext): Promise<void> {
        const game: CoyoteLiveGame = ctx.state.game;

        GameApiController.setResponseOk(ctx, {
            clientType: game.clientType,
            gameConfig: game.gameConfig,
            clientStrength: game.clientStrength,
        });
    }

    public static async getStrengthConfig(ctx: RouterContext): Promise<void> {
        const game: CoyoteLiveGame = ctx.state.game;
        
        GameApiController.setResponseOk(ctx, {
            strengthConfig: game.gameConfig.strength,
        });
    }

    public static async setStrengthConfig(ctx: RouterContext): Promise<void> {
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

        const gameList: Iterable<CoyoteLiveGame> = ctx.state.gameList;

        let successClientIds = new Set<string>();
        for (const game of gameList) {
            const req = postBody as SetStrengthConfigRequest;

            // 加入更新队列
            gameStrengthUpdateQueue.pushUpdate(game.clientId, req);

            successClientIds.add(game.clientId);
        }

        GameApiController.setResponseOk(ctx, {
            message: `成功设置了 ${successClientIds.size} 个游戏的强度配置`,
            successClientIds: Array.from(successClientIds),
        });
    }

    public static async getPulseId(ctx: RouterContext): Promise<void> {
        const game: CoyoteLiveGame = ctx.state.game;

        GameApiController.setResponseOk(ctx, {
            pulseId: game.gameConfig.pulseId,
        });
    }

    public static async setPulseId(ctx: RouterContext): Promise<void> {
        const req = ctx.request.body as { pulseId: string };

        if (!req.pulseId) {
            GameApiController.setResponse(ctx, {
                status: Status.Error,
                code: Code.ErrInvalidRequest,
                message: '无效的请求，需要 "pulseId" 参数',
            });
            return;
        }

        const globalPulseList = GameApiController.getGlobalPulseList(false);
        if (!globalPulseList.some(it => it.id === req.pulseId)) {
            GameApiController.setResponse(ctx, {
                status: Status.Error,
                code: Code.ErrInvalidPulseId,
                message: '无效的脉冲ID',
            });
            return;
        }

        const gameList: Iterable<CoyoteLiveGame> = ctx.state.gameList;
        
        let successClientIds = new Set<string>();
        for (const game of gameList) {
            game.updateConfig({
                ...game.gameConfig,
                pulseId: req.pulseId,
            });

            successClientIds.add(game.clientId);
        }

        GameApiController.setResponseOk(ctx, {
            message: `成功设置了 ${successClientIds.size} 个游戏的脉冲ID`,
            successClientIds: Array.from(successClientIds),
        });
    }

    public static async getPulseList(ctx: RouterContext): Promise<void> {
        // 关于为什么脉冲列表要根据游戏获取，是为了在将来适配DG Helper的情况下，用于获取DG-Lab内置的脉冲列表
        const _game: CoyoteLiveGame = ctx.state.game;
        
        // 是否获取完整的波形信息
        let isFullMode = ctx.request.query?.type === 'full';

        // 暂且只从配置文件中获取脉冲列表
        const pulseList = GameApiController.getGlobalPulseList(isFullMode);

        GameApiController.setResponseOk(ctx, {
            pulseList: pulseList,
        });
    }

    public static async fire(ctx: RouterContext): Promise<void> {
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
            GameApiController.setResponse(ctx, {
                status: Status.Error,
                code: Code.ErrInvalidRequest,
                message: '无效的请求，需要 "strength" 参数',
            });
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

        const gameList: Iterable<CoyoteLiveGame> = ctx.state.gameList;

        let successClientIds = new Set<string>();
        for (const game of gameList) {
            game.fire(req.strength, fireTime, pulseId, overrideTime);

            successClientIds.add(game.clientId);
        }

        GameApiController.setResponseOk(ctx, {
            message: `成功向 ${successClientIds.size} 个游戏发送了一键开火指令`,
            successClientIds: Array.from(successClientIds),
            warnings,
        });
    }
}