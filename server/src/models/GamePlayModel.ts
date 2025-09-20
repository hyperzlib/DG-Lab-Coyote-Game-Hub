import { Column, DataSource, Entity, Index, ManyToOne, PrimaryColumn } from "typeorm";
import { GameModel } from "./GameModel.js";
import { ormDateToNumberTransformer } from "./transformers/date.js";
import { GamePlayConfigListType, GamePlayEventAction, GamePlayEventListType } from "#app/types/gamePlay.js";
import { v4 as uuidv4 } from "uuid";
import { generateUUIDWithValidation } from "#app/utils/utils.js";
import { generateConnectCode } from "./index.js";

@Entity({ name: 'game_play' })
export class GamePlayModel {
    @PrimaryColumn({ type: 'int', name: 'game_play_id', primary: true, generated: true, comment: '游戏玩法ID' })
    gamePlayId!: number;

    @Column({ type: 'uuid', name: 'game_id', comment: '游戏ID' })
    @ManyToOne(() => GameModel, { onDelete: 'CASCADE' })
    gameId!: string;

    @Column({ type: 'uuid', name: 'connect_code', comment: '连接码' })
    @Index()
    connectCode!: string;

    @Column({ type: 'varchar', name: 'remark_name', length: 255, comment: '备注名' })
    remarkName!: string;

    @Column({ type: 'simple-enum', name: 'type', enum: ['api', 'iframe'], default: 'api', comment: '连接类型，api表示API连接，iframe表示嵌入式连接' })
    type!: 'api' | 'iframe';

    @Column({ type: 'text', name: 'iframe_url', nullable: true, comment: '嵌入式连接的URL' })
    iframeUrl?: string | null;

    @Column({ type: 'varchar', name: 'provider_id', length: 255, nullable: true, comment: '提供者（插件）ID' })
    providerId?: string | null;

    @Column({ type: 'varchar', name: 'provider_name', length: 100, nullable: true, comment: '提供者（插件）名称' })
    providerName?: string | null;

    @Column({ type: 'text', name: 'provider_icon', nullable: true, comment: '提供者（插件）图标' })
    providerIcon?: string | null;

    @Column({ type: 'int', name: 'last_connected_at', unsigned: true, nullable: true, transformer: ormDateToNumberTransformer, comment: '最后连接时间' })
    lastConnectedAt?: Date | null;

    @Column({ type: 'json', name: 'config_schema', nullable: true, comment: '配置Schema' })
    configSchema?: GamePlayConfigListType | null;

    @Column({ type: 'json', name: 'config', nullable: true, comment: '自定义配置' })
    config?: Record<string, any> | null;

    @Column({ type: 'json', name: 'event_schema', nullable: true, comment: '事件Schema' })
    eventSchema?: GamePlayEventListType | null;

    @Column({ type: 'json', name: 'event_config', nullable: true, comment: '事件配置' })
    eventConfig?: Record<string, GamePlayEventAction> | null;

    public static async create(db: DataSource, gameId: string, data?: Partial<GamePlayModel>): Promise<GamePlayModel> {
        const gamePlay = new GamePlayModel();
        gamePlay.gameId = gameId;
        gamePlay.connectCode = await generateConnectCode(db);
        
        if (data) {
            Object.assign(gamePlay, data);
        }

        await db.manager.save(gamePlay);
        return gamePlay;
    }

    public static async getById(db: DataSource, id: number): Promise<GamePlayModel | null> {
        return await db.manager.findOne(GamePlayModel, { where: { gamePlayId: id } });
    }

    public static async getByConnectCode(db: DataSource, connectCode: string): Promise<GamePlayModel | null> {
        return await db.manager.findOne(GamePlayModel, { where: { connectCode } });
    }
}
