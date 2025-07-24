import { ProviderIdMismatchError } from "#app/exceptions/ProviderIdMismatchError.js";
import { GamePlayModel } from "#app/models/GamePlayModel.js";
import { GameStrengthConfig } from "#app/types/game.js";
import { GamePlayActionSource, GamePlayLogType, GamePlayProviderInfo } from "#app/types/gamePlay.js";
import { ServerContext } from "#app/types/server.js";
import { FixedLenList } from "#app/utils/FixedLenList.js";
import { AbstractGameAction } from "./actions/AbstractGameAction.js";
import { CoyoteGameController, GameStrengthInfo } from "./CoyoteGameController.js";

export class GamePlayController {
    private game: CoyoteGameController;
    private ctx: ServerContext;
    private model: GamePlayModel;
    private actionLogs = new FixedLenList<GamePlayLogType>(200);

    public constructor(game: CoyoteGameController, ctx: ServerContext, model: GamePlayModel) {
        this.game = game;
        this.ctx = ctx;
        this.model = model;
    }

    public async initialize(): Promise<void> {

    }

    public get providerInfo(): GamePlayProviderInfo {
        return {
            providerId: this.model.providerId || null,
            providerName: this.model.providerName || null,
            providerIcon: this.model.providerIcon || null,
        };
    }
    
    public get gameStrength(): GameStrengthInfo {
        return this.game.gameStrength;
    }

    public async updateProviderInfo(providerInfo: GamePlayProviderInfo): Promise<void> {
        const db = this.ctx.database;

        if (this.model.providerId !== providerInfo.providerId) {
            throw new ProviderIdMismatchError("新的插件ID与当前游戏连接的插件ID不匹配，如果需要连接新的游戏插件，请新建一个游戏连接。");
        }

        this.model.providerId = providerInfo.providerId || null;
        this.model.providerName = providerInfo.providerName || null;
        this.model.providerIcon = providerInfo.providerIcon || null;

        // 更新数据库
        await db.getRepository(GamePlayModel).save(this.model);
    }

    public async updateStrengthConfig(config: GameStrengthConfig, actionSource?: GamePlayActionSource): Promise<void> {
        actionSource ??= { type: 'api' };

        await this.game.updateStrengthConfig(config);

        // 记录日志
        this.actionLogs.push({
            timestamp: Date.now(),
            source: actionSource,
            type: 'updateStrength',
            strengthConfig: config,
        });
    }

    public async startAction(action: AbstractGameAction, actionSource?: GamePlayActionSource): Promise<void> {
        actionSource ??= { type: 'api' };

        await this.game.startAction(action);

        // 记录日志
        const actionConstructor = action.constructor as typeof AbstractGameAction;
        this.actionLogs.push({
            timestamp: Date.now(),
            source: actionSource,
            type: 'startAction',
            actionId: actionConstructor.actionId,
            actionName: actionConstructor.actionName,
            data: action.config,
        });
    }

    public async stopAction(action: AbstractGameAction, actionSource?: GamePlayActionSource): Promise<void> {
        actionSource ??= { type: 'api' };

        await this.game.stopAction(action);

        // 记录日志
        const actionConstructor = action.constructor as typeof AbstractGameAction;
        this.actionLogs.push({
            timestamp: Date.now(),
            source: actionSource,
            type: 'stopAction',
            actionId: actionConstructor.actionId,
            actionName: actionConstructor.actionName,
            data: action.config,
        });
    }

    public async handleEvent(eventId: string, params?: number[], actionSource?: GamePlayActionSource): Promise<void> {
        actionSource ??= { type: 'event', eventId, params: params || null };

        // TODO: 根据事件配置处理事件逻辑
    }
}