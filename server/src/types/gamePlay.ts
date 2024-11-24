export type GamePlaySimpleEventDefinition = {
    type: 'simple';
    default?: number;
};

export type GamePlayNumericEventDefinition = {
    type: 'numeric';
    /** 最小值和最大值 */
    default?: [number, number];
};

export type GamePlayEventDefinition = {
    id: string;
    /** 事件名 */
    name: string;
    /** 帮助信息 */
    help?: string;
} & (GamePlaySimpleEventDefinition | GamePlayNumericEventDefinition);

export type GamePlayConfigSelectOption = {
    label: string;
    value: string;
};

export type GamePlayConfigEntryDefinition = {
    id: string;
    name: string;
    type: 'text' | 'int' | 'float' | 'boolean' | 'select';
    help?: string;
    options?: GamePlayConfigSelectOption[];
    default?: number;
};

/** 游戏玩法的定义信息 */
export type GamePlayDefinition = {
    /** 连接Token */
    token: string;
    /** 备注名 */
    remarkName?: string;
    /** 游戏标题 */
    title?: string;
    /** 游戏标题（原语言） */
    titleOriginal?: string;
    /** 游戏图标 */
    iconUrl?: string;
    /** 游戏描述 */
    description?: string;
    /** 事件定义 */
    events?: GamePlayEventDefinition[];
    /** 其他配置定义 */
    configs?: GamePlayConfigEntryDefinition[];
};

/** 游戏玩法的用户设置 */
export type GamePlayUserConfig = {
    token: string;
    events: Record<string, any>;
    configs: Record<string, any>;
}

export type CoyoteGamePlayConfig = {
    gamePlayList: GamePlayDefinition[];
};

export type CoyoteGamePlayUserConfig = {
    configList: Record<string, GamePlayUserConfig>;
};