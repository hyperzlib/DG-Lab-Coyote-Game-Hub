import { CoyoteGameController } from "../CoyoteGameController";

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

    /** 执行游戏动作 */
    public abstract execute(ab: AbortController, harvest: () => void, done: () => void): Promise<void>;

    /** 更新游戏动作的配置 */
    public abstract updateConfig(config: ActionConfig): void;
}