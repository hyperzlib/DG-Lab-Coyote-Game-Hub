import { Column, Entity, ManyToOne, PrimaryColumn } from "typeorm";
import { GameModel } from "./GameModel.js";
import { ormDateToNumberTransformer } from "./transformers/date.js";

@Entity({ name: 'game_play' })
export class GamePlayModel {
    @PrimaryColumn({ type: 'uuid', primary: true, name: 'game_play_id', comment: '游戏玩法ID（同时也是连接码）' })
    gamePlayId!: string;

    @Column({ type: 'uuid', name: 'game_id', comment: '游戏ID' })
    @ManyToOne(() => GameModel, { onDelete: 'CASCADE' })
    gameId!: string;

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

    @Column({ type: 'boolean', name: 'is_readonly', default: false, comment: '是否只读（只能读取游戏配置和状态，不能修改）' })
    isReadonly!: boolean;

    @Column({ type: 'int', name: 'last_connected_at', unsigned: true, nullable: true, transformer: ormDateToNumberTransformer, comment: '最后连接时间' })
    lastConnectedAt?: Date | null;

    @Column({ type: 'json', name: 'config', nullable: true, comment: '更多配置' })
    config?: Record<string, any> | null;
}
