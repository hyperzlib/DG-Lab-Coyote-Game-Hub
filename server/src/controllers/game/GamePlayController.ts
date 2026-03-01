import { ProviderAlreadyInitializedError } from "#app/exceptions/ProviderAlreadyInitializedError.js";
import { GamePlayModel } from "#app/models/GamePlayModel.js";
import { generateConnectCode } from "#app/models/index.js";
import type { GameStrengthConfig } from "#app/types/game.js";
import type { GamePlayActionSource, GamePlayEventAction, GamePlayLogType, GamePlayProviderInfo, GamePlayStrengthUpdateMode } from "#app/types/gamePlay.js";
import type { ServerContext } from "#app/types/server.js";
import { FixedLenList } from "#app/utils/fixedLenList.js";
import type { AbstractGameAction } from "./actions/AbstractGameAction.js";
import type { CoyoteGameController, GameStrengthInfo } from "./CoyoteGameController.js";

/**
 * GamePlay 控制器
 * 用于控制第三方游戏插件的操作
 */
export class GamePlayController {
    private game: CoyoteGameController;
    private ctx: ServerContext;
    private model: GamePlayModel;
    private actionLogs = new FixedLenList<GamePlayLogType>(200);

    public connectCode: string = "";

    public strengthUpdateMode: GamePlayStrengthUpdateMode = 'additive';

    /** 游戏配置 */
    public config: Record<string, any> = {};

    /** 事件配置 */
    public eventConfig: Record<string, GamePlayEventAction> = {};

    public constructor(game: CoyoteGameController, ctx: ServerContext, model: GamePlayModel) {
        this.game = game;
        this.ctx = ctx;
        this.model = model;

        this.connectCode = model.connectCode;
        this.config = this.model.config ?? {};
        this.eventConfig = this.model.eventConfig ?? {};
    }

    public async initialize(): Promise<void> { }

    /**
     * 插件信息，包含插件ID、名称和图标等信息
     */
    public get providerInfo(): GamePlayProviderInfo {
        return {
            providerId: this.model.providerId || null,
            providerName: this.model.providerName || null,
            providerIcon: this.model.providerIcon || null,
        };
    }

    /**
     * 当前插件的游戏强度信息
     */
    public get gameStrength(): GameStrengthInfo {
        return this.game.gameStrength;
    }

    /**
     * 更新插件信息
     * @param providerInfo 新的插件信息
     * @throws ProviderAlreadyInitializedError 重复初始化错误，如果新的插件ID与当前连接的插件ID不匹配，则抛出该错误。
     */
    public async updateProviderInfo(providerInfo: GamePlayProviderInfo): Promise<void> {
        const db = this.ctx.database;

        if (this.model.providerId !== providerInfo.providerId) {
            throw new ProviderAlreadyInitializedError("新的插件ID与当前游戏连接的插件ID不匹配，如果需要连接新的游戏插件，请新建一个游戏连接。");
        }

        this.model.providerId = providerInfo.providerId || null;
        this.model.providerName = providerInfo.providerName || null;
        this.model.providerIcon = providerInfo.providerIcon || null;

        // 更新数据库
        await db.getRepository(GamePlayModel).save(this.model);
    }

    /**
     * 设置游戏强度
     * @param config 游戏强度配置
     * @param actionSource 操作来源
     */
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

    /**
     * 启动游戏动作（如：一键开火）
     * @param action 游戏动作实例
     * @param actionSource 操作来源
     */
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

    /**
     * 停止游戏动作
     * @param action 游戏动作实例
     * @param actionSource 操作来源
     */
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


    /**
     * 触发游戏事件
     * @param eventId 事件ID
     * @param params 事件参数
     * @param actionSource 操作来源
     */
    public async emitGameEvent(eventId: string, params?: number[], actionSource?: GamePlayActionSource): Promise<void> {
        const newActionSource: GamePlayActionSource = {
            type: 'event',
            eventId,
            params: params || null,
            comment: actionSource?.comment || null,
        };

        const eventAction = this.eventConfig[eventId];
        if (!eventAction) {
            return; // 如果没有配置该事件，则忽略
        }

        switch (eventAction.type) {
            case 'addStrength': {
                const currentStrength = this.game.gameStrength.strength;
            }
        }
    }

    public async resetConnectCode(): Promise<void> {
        const db = this.ctx.database;

        // 生成新的连接码
        this.connectCode = await generateConnectCode(db);

        // 更新模型
        this.model.connectCode = this.connectCode;

        // 保存到数据库
        await db.getRepository(GamePlayModel).save(this.model);
    }

    public async saveConfig(): Promise<void> {
        const db = this.ctx.database;

        // 更新模型配置
        this.model.config = this.config;
        this.model.eventConfig = this.eventConfig;

        // 保存到数据库
        await db.getRepository(GamePlayModel).save(this.model);
    }
}