import { v4 as uuidv4 } from "uuid";

import { GameStrengthConfig, MainGameConfig } from "#app/types/game.js";
import { AfterUpdate, Column, DataSource, Entity, Index, PrimaryColumn } from "typeorm";
import { ormDateToNumberTransformer } from "./transformers/date.js";
import { DGLabPulseService } from "#app/services/DGLabPulse.js";
import { ExEventEmitter } from "#app/utils/ExEventEmitter.js";
import { ormLooseJsonTransformer } from "./transformers/json.js";

export interface GameModelEvents {
    configUpdated: [newConfig: any];
};

@Entity({ name: 'game' })
export class GameModel implements MainGameConfig {
    public static events = new ExEventEmitter<GameModelEvents>();

    @PrimaryColumn({ type: 'uuid', name: 'game_id', comment: '游戏ID' })
    gameId!: string;

    @Column({ type: 'varchar', name: 'main_connect_code', length: 64, nullable: true, comment: '主连接码' })
    @Index({ unique: true })
    mainConnectCode?: string | null;

    @Column({ type: 'varchar', name: 'replica_connect_code', length: 64, nullable: true, comment: '只读链接码（主要）' })
    @Index({ unique: true })
    replicaConnectCode?: string | null;

    @Column({ type: 'int', name: 'fire_strength_limit', default: 30, comment: '一键开火强度限制，默认30' })
    fireStrengthLimit!: number;

    @Column({ type: 'json', name: 'strength_change_interval', default: '[10, 30]', comment: '强度变化间隔，单位秒' })
    strengthChangeInterval!: [number, number];

    @Column({ type: 'boolean', name: 'enable_b_channel', default: false, comment: '是否启用B通道' })
    enableBChannel!: boolean;

    @Column({ type: 'double', name: 'b_channel_strength_multiplier', default: 1, comment: 'B通道相对于A通道的强度倍率，默认1' })
    bChannelStrengthMultiplier!: number;

    @Column({ type: 'text', name: 'pulse_id', default: '""', transformer: ormLooseJsonTransformer, comment: '波形ID或ID列表' })
    pulseId!: string | string[];

    @Column({ type: 'text', name: 'fire_pulse_id', nullable: true, comment: '一键开火波形ID，如果不设置则使用当前波形' })
    firePulseId?: string | null;

    @Column({ type: 'simple-enum', name: 'pulse_mode', enum: ['single', 'sequence', 'random'], default: 'single', comment: '波形播放模式' })
    pulseMode!: 'single' | 'sequence' | 'random';

    @Column({ type: 'int', name: 'pulse_change_interval', default: 60, comment: '波形切换间隔，单位秒' })
    pulseChangeInterval!: number;

    @Column({ type: 'int', name: 'last_connected_at', unsigned: true, nullable: true, transformer: ormDateToNumberTransformer, comment: '最后连接时间' })
    lastConnectedAt?: Date | null;

    @AfterUpdate()
    public async handleAfterUpdate() {
        // 发送配置更新事件
        GameModel.events.emitSub('configUpdated', this.gameId, this);
    }

    public static getDefaultConfig(): GameModel {
        let model = new GameModel()

        model.gameId = uuidv4();
        model.mainConnectCode = uuidv4();
        model.replicaConnectCode = uuidv4();
        model.fireStrengthLimit = 30;
        model.strengthChangeInterval = [15, 30];
        model.enableBChannel = false;
        model.bChannelStrengthMultiplier = 1;
        model.pulseId = [DGLabPulseService.instance.getDefaultPulse().id];
        model.pulseMode = 'single';
        model.pulseChangeInterval = 60;

        return model;
    }

    public static async getByGameId(db: DataSource, gameId: string): Promise<GameModel | null> {
        const gameRepository = db.getRepository(GameModel);
        return await gameRepository.findOneBy({ gameId });
    }

    public static async getOrCreateByGameId(db: DataSource, gameId: string): Promise<GameModel> {
        const gameRepository = db.getRepository(GameModel);
        let game = await gameRepository.findOneBy({ gameId });
        if (!game) {
            game = GameModel.getDefaultConfig();
            game.gameId = gameId;
            game = await gameRepository.save(game);
        }

        if (!game.mainConnectCode || !game.replicaConnectCode) {
            if (!game.mainConnectCode) game.mainConnectCode = uuidv4();
            if (!game.replicaConnectCode) game.replicaConnectCode = uuidv4();
            game = await gameRepository.save(game);
        }

        return game;
    }

    public static async update(db: DataSource, gameId: string, data: Partial<GameModel>): Promise<GameModel | null> {
        const repo = db.getRepository(GameModel);
        let game = await GameModel.getByGameId(db, gameId);
        if (!game) {
            return null;
        }

        Object.assign(game, data);

        // 如果波形ID是字符串，则转换为数组
        if (typeof game.pulseId === 'string') {
            game.pulseId = [game.pulseId];
        }

        return await repo.save(game);
    }
}