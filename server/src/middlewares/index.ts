import { RouterContext } from "koa-router";
import { MainConfig } from "../config";
import { Code, GameApiController, Status } from "../controllers/http/GameApi";
import { CoyoteLiveGameManager } from "../managers/CoyoteLiveGameManager";
import { CoyoteLiveGame } from "../controllers/game/CoyoteLiveGame";

export class Middleware {
    /**
     * 获取指定的游戏游戏实例，并加入上下文字段 game
     * 
     * 若游戏不存在，或广播被禁用，返回错误
     */
    public static async acquireGameInstance(ctx: RouterContext, next: Function) {
        let game: CoyoteLiveGame | null = null;
        if (ctx.params.id === 'all') {
            if (!MainConfig.value.allowBroadcastToClients) {
                GameApiController.setResponse(ctx, {
                    status: Status.Error,
                    code: Code.ErrBroadcastNotAllowed,
                    message: '当前服务器配置不允许向所有客户端广播指令',
                });
                return;
            }

            game = CoyoteLiveGameManager.instance.getGameList().next().value;
            if (!game) {
                GameApiController.setResponse(ctx, {
                    status: Status.Error,
                    code: Code.ErrGameNotFound,
                    message: '游戏进程不存在，可能是客户端未连接',
                });
                return;
            }
        } else {
            game = Middleware.requestGameInstance(ctx);
            if (!game) {
                return;
            }
        }
    
        ctx.state.game = game;
    
        await next();
    }

    /**
     * 获取指定的游戏游戏实例，并加入上下文字段 gameList
     * 
     * 若游戏不存在，返回空列表
     * 
     * 若广播被禁用，返回错误
     */
    public static async acquireGameList(ctx: RouterContext, next: Function) {
        let gameList: Iterable<CoyoteLiveGame> = [];
        if (ctx.params.id === 'all') {
            //todo
            if (!MainConfig.value.allowBroadcastToClients) {
                GameApiController.setResponse(ctx, {
                    status: Status.Error,
                    code: Code.ErrBroadcastNotAllowed,
                    message: '当前服务器配置不允许向所有客户端广播指令',
                });
                return;
            }

            gameList = CoyoteLiveGameManager.instance.getGameList();
        } else {
            const game = Middleware.requestGameInstance(ctx);
            if (!game) {
                return;
            }

            (gameList as CoyoteLiveGame[]).push(game);
        }
    
        ctx.state.gameList = gameList;
    
        await next();
    }

    /**
     * 判断请求体是否为空
     * 
     * 若参数为空，返回错误
     */
    public static async assertNotEmptyBody(ctx: RouterContext, next: Function) {
        if (!ctx.request.body || Object.keys(ctx.request.body).length === 0) {
            GameApiController.setResponse(ctx, {
                status: Status.Error,
                code: Code.ErrInvalidRequest,
                message: '无效的请求，参数为空',
            });
            return;
        }

        await next();
    }

    private static requestGameInstance(ctx: RouterContext): CoyoteLiveGame | null {
        if (!ctx.params.id) {
            GameApiController.setResponse(ctx, {
                status: Status.Error,
                code: Code.ErrInvalidClientId,
                message: '无效的客户端ID',
            });
            return null;
        }

        const game = CoyoteLiveGameManager.instance.getGame(ctx.params.id);
        if (!game) {
            GameApiController.setResponse(ctx, {
                status: Status.Error,
                code: Code.ErrGameNotFound,
                message: '游戏进程不存在，可能是客户端未连接',
            });
            return null;
        }

        return game;
    }
}

