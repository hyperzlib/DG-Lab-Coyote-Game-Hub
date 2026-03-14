import { ChannelEnum } from "#app/types/game.js";
import { CoyoteGameController } from "../CoyoteGameController.js";

export abstract class AbstractGameAction<ActionConfig = any> {
    /** 游戏动作的默认权重 */
    static readonly defaultPriority = 0;

    public game!: CoyoteGameController;
    abortController: AbortController = new AbortController();

    constructor(
        /** 游戏动作的配置 */
        public config: ActionConfig,
        /** 游戏动作的权重 */
        public priority: number = AbstractGameAction.defaultPriority,
    ) {}

    _initialize(game: CoyoteGameController) {
        this.game = game;
        this.initialize();
    }

    initialize() {
        // Subclass could override this method
    }

    _destroy() {
        this.abortController.abort();
        this.destroy();
    }

    destroy() {
        // Subclass could override this method
    }

    /** 执行游戏动作 */
    public abstract execute(channel: ChannelEnum, ab: AbortController, harvest: () => void): Promise<void>;

    /** 更新游戏动作的配置 */
    public abstract updateConfig(config: ActionConfig): void;

    /** 判断游戏动作是否适用于指定通道 */
    public abstract isApplicableToChannel(channel: ChannelEnum): boolean;

    _isFinished(): boolean {
        if (this.abortController.signal.aborted) {
            return true;
        }
        return this.isFinished();
    }

    /** 游戏动作是否已结束 */
    public abstract isFinished(): boolean;
}