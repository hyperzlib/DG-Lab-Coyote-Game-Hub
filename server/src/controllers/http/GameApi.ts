import { Context } from 'koa';
import { RouterContext } from 'koa-router';
import { CoyoteGameManager } from '#app/managers/CoyoteGameManager.js';
import { GameStrengthConfig, MainGameConfig } from '#app/types/game.js';
import { CoyoteGameController } from '../game/CoyoteGameController.js';
import { MainConfig } from '#app/config.js';
import { DGLabPulseService } from '#app/services/DGLabPulse.js';
import { asleep } from '#app/utils/utils.js';
import { CoyoteGameConfigService, GameConfigType } from '#app/services/CoyoteGameConfigService.js';
import { FIRE_MAX_DURATION, FIRE_MAX_STRENGTH, GameFireAction } from '../game/actions/GameFireAction.js';
import { body, responses, routeConfig, z } from 'koa-swagger-decorator';
import {
    ClientIdSchema,
    GetGameApiInfoResponse,
    GetGameApiInfoResponseSchema,
    GetGameInfoResponse,
    GetGameInfoResponseSchema,
    GetGameStrengthConfigResponse,
    GetGameStrengthConfigResponseSchema,
    GetPulseIdResponse,
    GetPulseIdResponseSchema,
    GetPulseListResponse,
    GetPulseListResponseSchema,
    SetConfigResponse,
    SetConfigResponseSchema,
    SetPulseIdRequest,
    SetPulseIdRequestSchema,
    SetStrengthConfigRequestSchema,
    StartFireActionRequest,
    StartFireActionRequestSchema
} from './schemas/GameApi.js';

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
};

export type FireRequest = {
    strength: number;
    time?: number;
    override?: boolean;
    pulseId?: string;
};

export type ApiResponseType = {
    status: number;
    code: string;
    message?: string;
    warnings?: { code: string, message: string }[];
} & Record<string, any>;

export function apiResponse(ctx: Context, data: ApiResponseType) {
    ctx.response.header['X-Api-Status'] = data.status;

    if (data.status === 0) {
        ctx.response.header['X-Api-Error-Code'] = data.code;
        ctx.response.header['X-Api-Error-Message'] = data.message;
    }

    if (data.warnings) {
        ctx.response.header['X-Api-Warning-Code'] = data.warnings.map(w => w.code).join(', ');
        ctx.response.header['X-Api-Warning-Message'] = data.warnings.map(w => w.message).join(', ');
    }

    ctx.body = data;
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
        while (this.queuedUpdates.get(clientId)) {
            // Merge updates
            const game = CoyoteGameManager.instance.getGame(clientId);
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

export const gameStrengthUpdateQueue = new GameStrengthUpdateQueue();

export class GameApiController {
    private async requestGameInstance(ctx: RouterContext): Promise<CoyoteGameController | null> {
        if (!ctx.params.id) {
            apiResponse(ctx, {
                status: 0,
                code: 'ERR::INVALID_CLIENT_ID',
                message: '无效的客户端ID',
            });
            return null;
        }

        console.log('params', ctx.params);

        const game = CoyoteGameManager.instance.getGame(ctx.params.id);
        if (!game) {
            apiResponse(ctx, {
                status: 0,
                code: 'ERR::GAME_NOT_FOUND',
                message: '游戏进程不存在，可能是客户端未连接',
            });
            return null;
        }

        return game;
    }

    @routeConfig({
        method: 'get',
        path: '/api/game',
        summary: '获取游戏API信息',
        operationId: 'Get Game API Info',
        tags: ['Game V1'],
    })
    @responses(GetGameApiInfoResponseSchema)
    public async gameApiInfo(ctx: RouterContext): Promise<void> {
        apiResponse(ctx, {
            status: 1,
            code: 'OK',
            message: 'Coyote Live 游戏API',
            minApiVersion: 1,
            maxApiVersion: 2,
        } as GetGameApiInfoResponse);
    };

    @routeConfig({
        method: 'get',
        path: '/api/v2/game',
        summary: '获取游戏API信息',
        operationId: 'Get Game API Info V2',
        tags: ['Game V2'],
    })
    @responses(GetGameApiInfoResponseSchema)
    public async gameApiInfoV2(ctx: RouterContext): Promise<void> {
        return await this.gameApiInfo(ctx);
    }

    @routeConfig({
        method: 'get',
        path: '/api/game/{id}',
        summary: '获取游戏信息',
        operationId: 'Get Game Info',
        tags: ['Game V1'],
        request: {
            params: z.object({
                id: ClientIdSchema,
            }),
        }
    })
    @responses(GetGameInfoResponseSchema)
    public async gameInfo(ctx: RouterContext): Promise<void> {
        let game: CoyoteGameController | null = null;
        let clientId = '';
        if (ctx.params.id === 'all') {
            if (!MainConfig.value.allowBroadcastToClients) {
                apiResponse(ctx, {
                    status: 0,
                    code: 'ERR::BROADCAST_NOT_ALLOWED',
                    message: '当前服务器配置不允许向所有客户端广播指令',
                });
                return;
            }
            
            game = CoyoteGameManager.instance.getGameList().next().value;
            clientId = game!.clientId;
        } else {
            game = await this.requestGameInstance(ctx);
            clientId = ctx.params.id;
        }

        if (!clientId) {
            apiResponse(ctx, {
                status: 0,
                code: 'ERR::GAME_NOT_FOUND',
                message: '游戏进程不存在，可能是客户端未连接',
            });
            return;
        }

        let gameConfig = await CoyoteGameConfigService.instance.get(clientId, GameConfigType.MainGame, false);

        if (game) {
            apiResponse(ctx, {
                status: 1,
                code: 'OK',
                strengthConfig: game.strengthConfig,
                gameConfig,
                clientStrength: game.clientStrength,
                currentPulseId: game.pulsePlayList.getCurrentPulseId(),
            } as GetGameInfoResponse);
        } else {
            apiResponse(ctx, {
                status: 1,
                code: 'OK',
                strengthConfig: null,
                gameConfig,
                clientStrength: null,
                currentPulseId: '',
            } as GetGameInfoResponse);
        }
    }

    @routeConfig({
        method: 'get',
        path: '/api/v2/game/{id}',
        summary: '获取游戏信息',
        operationId: 'Get Game Info V2',
        tags: ['Game V2'],
        request: {
            params: z.object({
                id: ClientIdSchema,
            }),
        }
    })
    @responses(GetGameInfoResponseSchema)
    public async gameInfoV2(ctx: RouterContext): Promise<void> {
        return await this.gameInfo(ctx);
    }

    @routeConfig({
        method: 'get',
        path: '/api/game/{id}/strength_config',
        summary: '获取游戏强度配置',
        operationId: 'Get Game Strength Info',
        tags: ['Game V1'],
        request: {
            params: z.object({
                id: ClientIdSchema,
            }),
        }
    })
    @responses(GetGameStrengthConfigResponseSchema)
    public async getGameStrength(ctx: RouterContext): Promise<void> {
        let game: CoyoteGameController | null = null;
        if (ctx.params.id === 'all') {
            if (!MainConfig.value.allowBroadcastToClients) {
                apiResponse(ctx, {
                    status: 0,
                    code: 'ERR::BROADCAST_NOT_ALLOWED',
                    message: '当前服务器配置不允许向所有客户端广播指令',
                });
                return;
            }

            game = CoyoteGameManager.instance.getGameList().next().value;
        } else {
            game = await this.requestGameInstance(ctx);
        }
        
        if (!game) {
            apiResponse(ctx, {
                status: 0,
                code: 'ERR::GAME_NOT_FOUND',
                message: '游戏进程不存在，可能是客户端未连接',
            });
            return;
        }

        apiResponse(ctx, {
            status: 1,
            code: 'OK',
            strengthConfig: game.strengthConfig,
        } as GetGameStrengthConfigResponse);
    }

    @routeConfig({
        method: 'get',
        path: '/api/v2/game/{id}/strength',
        summary: '获取游戏强度配置',
        operationId: 'Get Game Strength Info V2',
        tags: ['Game V2'],
        request: {
            params: z.object({
                id: ClientIdSchema,
            }),
        }
    })
    @responses(GetGameStrengthConfigResponseSchema)
    public async getGameStrengthV2(ctx: RouterContext): Promise<void> {
        return await this.getGameStrength(ctx);
    }

    @routeConfig({
        method: 'post',
        path: '/api/game/{id}/strength_config',
        summary: '设置游戏强度配置',
        operationId: 'Set Game Strength Info',
        tags: ['Game V1'],
        request: {
            params: z.object({
                id: ClientIdSchema,
            }),
        }
    })
    @body(SetStrengthConfigRequestSchema)
    @responses(SetConfigResponseSchema)
    public async setGameStrength(ctx: RouterContext): Promise<void> {
        if (!ctx.params.id) {
            apiResponse(ctx, {
                status: 0,
                code: 'ERR::INVALID_CLIENT_ID',
                message: '无效的客户端ID',
            });
            return;
        }

        let postBody: SetStrengthConfigRequest;
        try {
            postBody = SetStrengthConfigRequestSchema.parse(ctx.request.body);
        } catch (err: any) {
            apiResponse(ctx, {
                status: 0,
                code: 'ERR::INVALID_REQUEST',
                message: `无效的请求，参数错误: ${err.message}`,
            });
            return;
        }

        let gameList: Iterable<CoyoteGameController> = [];
        if (ctx.params.id === 'all') { // 广播模式，设置所有游戏的强度配置
            if (!MainConfig.value.allowBroadcastToClients) {
                apiResponse(ctx, {
                    status: 0,
                    code: 'ERR::BROADCAST_NOT_ALLOWED',
                    message: '当前服务器配置不允许向所有客户端广播指令',
                });
                return;
            }

            gameList = CoyoteGameManager.instance.getGameList();
        } else  { // 设置指定游戏的强度配置
            const game = CoyoteGameManager.instance.getGame(ctx.params.id);
            if (!game) {
                apiResponse(ctx, {
                    status: 0,
                    code: 'ERR::GAME_NOT_FOUND',
                    message: '游戏进程不存在，可能是客户端未连接',
                });
                return;
            }

           (gameList as CoyoteGameController[]).push(game);
        }

        let successClientIds = new Set<string>();
        for (const game of gameList) {
            const req = postBody as SetStrengthConfigRequest;

            // 加入更新队列
            gameStrengthUpdateQueue.pushUpdate(game.clientId, req);

            successClientIds.add(game.clientId);
        }

        apiResponse(ctx, {
            status: 1,
            code: 'OK',
            message: `成功设置了 ${successClientIds.size} 个游戏的强度配置`,
            successClientIds: Array.from(successClientIds),
        } as SetConfigResponse);
    }

    @routeConfig({
        method: 'post',
        path: '/api/v2/game/{id}/strength',
        summary: '设置游戏强度配置',
        operationId: 'Set Game Strength Info V2',
        tags: ['Game V2'],
        request: {
            params: z.object({
                id: ClientIdSchema,
            }),
        }
    })
    @body(SetStrengthConfigRequestSchema)
    @responses(SetConfigResponseSchema)
    public async setGameStrengthV2(ctx: RouterContext): Promise<void> {
        return await this.setGameStrength(ctx);
    }

    /**
     * 获取当前波形
     * @param ctx 
     * @returns 
     */
    @routeConfig({
        method: 'get',
        path: '/api/game/{id}/pulse_id',
        summary: '获取游戏当前波形ID和波形播放列表',
        operationId: 'Get Game Pulse ID',
        tags: ['Game V1'],
        request: {
            params: z.object({
                id: ClientIdSchema,
            }),
        }
    })
    @responses(GetPulseIdResponseSchema)
    public async getPulseId(ctx: RouterContext): Promise<void> {
        let clientId: string = '';
        if (ctx.params.id === 'all') {
            if (!MainConfig.value.allowBroadcastToClients) {
                apiResponse(ctx, {
                    status: 0,
                    code: 'ERR::BROADCAST_NOT_ALLOWED',
                    message: '当前服务器配置不允许向所有控制器广播指令',
                });
                return;
            }

            const game: CoyoteGameController = CoyoteGameManager.instance.getGameList().next().value;
            clientId = game.clientId;
        } else {
            clientId = ctx.params.id;
        }
        
        if (!clientId) {
            apiResponse(ctx, {
                status: 0,
                code: 'ERR::GAME_NOT_FOUND',
                message: '游戏配置不存在，可能是控制器未连接',
            });
            return;
        }

        const gameConfig = await CoyoteGameConfigService.instance.get(clientId, GameConfigType.MainGame, false);
        if (!gameConfig) {
            apiResponse(ctx, {
                status: 0,
                code: 'ERR::GAME_NOT_FOUND',
                message: '游戏配置不存在，可能是控制器未连接',
            });
            return;
        }

        let currentPulseId = typeof gameConfig.pulseId === 'string' ? gameConfig.pulseId : gameConfig.pulseId[0];
        const game = CoyoteGameManager.instance.getGame(clientId);
        if (game) {
            currentPulseId = game.pulsePlayList.getCurrentPulseId();
        }
        

        apiResponse(ctx, {
            status: 1,
            code: 'OK',
            currentPulseId,
            pulseId: gameConfig.pulseId,
        } as GetPulseIdResponse);
    }

    @routeConfig({
        method: 'get',
        path: '/api/v2/game/{id}/pulse',
        summary: '获取游戏当前波形ID和波形播放列表',
        operationId: 'Get Game Pulse ID V2',
        tags: ['Game V2'],
        request: {
            params: z.object({
                id: ClientIdSchema,
            }),
        }
    })
    @responses(GetPulseIdResponseSchema)
    public async getPulseIdV2(ctx: RouterContext): Promise<void> {
        return await this.getPulseId(ctx);
    }

    /**
     * 设置当前波形
     * @param ctx 
     * @returns 
     */
    @routeConfig({
        method: 'post',
        path: '/api/game/{id}/pulse_id',
        summary: '设置游戏波形播放列表',
        operationId: 'Set Game Pulse ID',
        tags: ['Game V1'],
        request: {
            params: z.object({
                id: ClientIdSchema,
            }),
        }
    })
    @body(SetPulseIdRequestSchema)
    @responses(SetConfigResponseSchema)
    public async setPulseId(ctx: RouterContext): Promise<void> {
        if (!ctx.params.id) {
            apiResponse(ctx, {
                status: 0,
                code: 'ERR::INVALID_CLIENT_ID',
                message: '无效的客户端ID',
            });
            return;
        }

        if (!ctx.request.body || Object.keys(ctx.request.body).length === 0) {
            apiResponse(ctx, {
                status: 0,
                code: 'ERR::INVALID_REQUEST',
                message: '无效的请求，参数为空',
            });
            return;
        }

        let postBody: SetPulseIdRequest;
        try {
            postBody = SetPulseIdRequestSchema.parse(ctx.request.body);
        } catch (err: any) {
            apiResponse(ctx, {
                status: 0,
                code: 'ERR::INVALID_REQUEST',
                message: `无效的请求，参数错误: ${err.message}`,
            });
            return;
        }

        if (!postBody.pulseId) {
            apiResponse(ctx, {
                status: 0,
                code: 'ERR::INVALID_REQUEST',
                message: '无效的请求，需要 "pulseId" 参数',
            });
            return;
        }

        let clientIdList: string[] = [];
        if (ctx.params.id === 'all') { // 广播模式，设置所有游戏的强度配置
            if (!MainConfig.value.allowBroadcastToClients) {
                apiResponse(ctx, {
                    status: 0,
                    code: 'ERR::BROADCAST_NOT_ALLOWED',
                    message: '当前服务器配置不允许向所有客户端广播指令',
                });
                return;
            }

            const gameList = CoyoteGameManager.instance.getGameList();
            for (const game of gameList) {
                clientIdList.push(game.clientId);
            }
        } else  { // 设置指定游戏的强度配置
            clientIdList.push(ctx.params.id);
        }
        
        let successClientIds = new Set<string>();
        for (const clientId of clientIdList) {
            CoyoteGameConfigService.instance.update(clientId, GameConfigType.MainGame, {
                pulseId: postBody.pulseId,
            });

            successClientIds.add(clientId);
        }

        apiResponse(ctx, {
            status: 1,
            code: 'OK',
            message: `成功设置了 ${successClientIds.size} 个游戏的波形ID`,
            successClientIds: Array.from(successClientIds),
        } as SetConfigResponse);
    }

    
    @routeConfig({
        method: 'post',
        path: '/api/v2/game/{id}/pulse',
        summary: '设置游戏波形播放列表',
        operationId: 'Set Game Pulse ID V2',
        tags: ['Game V2'],
        request: {
            params: z.object({
                id: ClientIdSchema,
            }),
        }
    })
    @body(SetPulseIdRequestSchema)
    @responses(SetConfigResponseSchema)
    public async setPulseIdV2(ctx: RouterContext): Promise<void> {
        return await this.setPulseId(ctx);
    }

    /**
     * 获取波形列表
     * @param ctx 
     */
    @routeConfig({
        method: 'get',
        path: '/api/game/{id}/pulse_list',
        summary: '获取游戏波形列表',
        operationId: 'Get Game Pulse List',
        tags: ['Game V1'],
        request: {
            params: z.object({
                id: ClientIdSchema,
            }),
        }
    })
    @responses(GetPulseListResponseSchema)
    public async getPulseList(ctx: RouterContext): Promise<void> {
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

        apiResponse(ctx, {
            status: 1,
            code: 'OK',
            pulseList,
        } as GetPulseListResponse);
    }

    @routeConfig({
        method: 'get',
        path: '/api/v2/game/{id}/pulse_list',
        summary: '获取游戏波形列表',
        operationId: 'Get Game Pulse List V2',
        tags: ['Game V2'],
        request: {
            params: z.object({
                id: ClientIdSchema,
            }),
        }
    })
    @responses(GetPulseListResponseSchema)
    public async getPulseListV2(ctx: RouterContext): Promise<void> {
        return await this.getPulseList(ctx);
    }

    @routeConfig({
        method: 'post',
        path: '/api/game/{id}/fire',
        summary: '一键开火',
        operationId: 'Start Action Fire',
        tags: ['Game V1'],
        request: {
            params: z.object({
                id: ClientIdSchema,
            }),
        },
    })
    @body(StartFireActionRequestSchema)
    @responses(SetConfigResponseSchema)
    public async startActionFire(ctx: RouterContext): Promise<void> {
        if (!ctx.params.id) {
            apiResponse(ctx, {
                status: 0,
                code: 'ERR::INVALID_CLIENT_ID',
                message: '无效的客户端ID',
            });
            return;
        }

        if (!ctx.request.body || Object.keys(ctx.request.body).length === 0) {
            apiResponse(ctx, {
                status: 0,
                code: 'ERR::INVALID_REQUEST',
                message: '无效的请求，参数为空',
            });
            return;
        }

        let postBody: StartFireActionRequest;
        try {
            postBody = await StartFireActionRequestSchema.parseAsync(ctx.request.body);
        } catch (err: any) {
            apiResponse(ctx, {
                status: 0,
                code: 'ERR::INVALID_REQUEST',
                message: `无效的请求，参数错误: ${err.message}`,
            });
            return;
        }

        const req = postBody as FireRequest;

        if (typeof req.strength !== 'number') {
            apiResponse(ctx, {
                status: 0,
                code: 'ERR::INVALID_REQUEST',
                message: '无效的请求，需要 "strength" 参数',
            });
            return;
        }

        let warnings: { code: string, message: string }[] = [];
        if (req.strength > FIRE_MAX_STRENGTH) {
            warnings.push({
                code: 'WARN::INVALID_STRENGTH',
                message: `一键开火强度值不能超过 ${FIRE_MAX_STRENGTH}`,
            });
        }

        const fireTime = req.time ?? 5000;

        if (fireTime > FIRE_MAX_DURATION) {
            warnings.push({
                code: 'WARN::INVALID_TIME',
                message: `一键开火时间不能超过 ${FIRE_MAX_DURATION}ms`,
            });
        }

        const pulseId = req.pulseId ?? undefined;
        const overrideTime = req.override ?? false;

        let gameList: Iterable<CoyoteGameController> = [];
        if (ctx.params.id === 'all') { // 广播模式，设置所有游戏的强度配置
            if (!MainConfig.value.allowBroadcastToClients) {
                apiResponse(ctx, {
                    status: 0,
                    code: 'ERR::BROADCAST_NOT_ALLOWED',
                    message: '当前服务器配置不允许向所有客户端广播指令',
                });
                return;
            }

            gameList = CoyoteGameManager.instance.getGameList();
        } else  { // 设置指定游戏的强度配置
            const game = CoyoteGameManager.instance.getGame(ctx.params.id);
            if (!game) {
                apiResponse(ctx, {
                    status: 0,
                    code: 'ERR::GAME_NOT_FOUND',
                    message: '游戏进程不存在，可能是客户端未连接',
                });
                return;
            }

           (gameList as CoyoteGameController[]).push(game);
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

        apiResponse(ctx, {
            status: 1,
            code: 'OK',
            message: `成功向 ${successClientIds.size} 个游戏发送了一键开火指令`,
            successClientIds: Array.from(successClientIds),
            warnings,
        } as SetConfigResponse);
    }

    @routeConfig({
        method: 'post',
        path: '/api/v2/game/{id}/action/fire',
        summary: '一键开火',
        operationId: 'Start Action Fire V2',
        tags: ['Game V2'],
        request: {
            params: z.object({
                id: ClientIdSchema,
            }),
        },
    })
    @body(StartFireActionRequestSchema)
    @responses(SetConfigResponseSchema)
    public async startActionFireV2(ctx: RouterContext): Promise<void> {
        return await this.startActionFire(ctx);
    }
}