import { PulseData } from "#app/types/game.js";
import { AfterInsert, AfterRemove, AfterUpdate, Column, DataSource, Entity, In, ManyToOne, PrimaryColumn } from "typeorm";
import { GameModel } from "./GameModel.js";
import { ormDateToNumberTransformer } from "./transformers/date.js";
import { ExEventEmitter } from "#app/utils/ExEventEmitter.js";

export interface PulseModelEvents {
    pulseListUpdated: [pulseData: PulseData, mode: 'insert' | 'update' | 'delete'];
};

@Entity({ name: 'pulse_data' })
export class CustomPulseModel implements PulseData {
    public static events = new ExEventEmitter<PulseModelEvents>();

    @PrimaryColumn({ type: 'varchar', name: 'pulse_id', length: 64, comment: '波形ID' })
    id!: string;

    @PrimaryColumn({ type: 'uuid', name: 'game_id', comment: '游戏ID' })
    @ManyToOne(() => GameModel, { onDelete: 'CASCADE' })
    gameId!: string;

    @Column({ type: 'varchar', name: 'pulse_name', length: 60, comment: '波形名称' })
    name!: string;

    @Column({ type: 'json', name: 'pulse_data', default: '[]', comment: '波形数据' })
    pulseData!: string[];

    @Column({ type: 'int', name: 'created_at', unsigned: true, transformer: ormDateToNumberTransformer, comment: '创建时间' })
    createdAt!: Date;

    public static async getPulseListByGameId(db: DataSource, gameId: string): Promise<CustomPulseModel[]> {
        return db.getRepository(CustomPulseModel).find({
            where: { gameId },
            order: { createdAt: 'DESC' },
        });
    }

    @AfterUpdate()
    public async handleAfterUpdate() {
        // 发送波形数据更新事件
        CustomPulseModel.events.emitSub('pulseListUpdated', this.gameId, this, 'update');
    }

    @AfterInsert()
    public async handleAfterInsert() {
        // 发送波形数据更新事件
        CustomPulseModel.events.emitSub('pulseListUpdated', this.gameId, this, 'insert');
    }

    @AfterRemove()
    public async handleAfterRemove() {
        // 发送波形数据更新事件
        CustomPulseModel.events.emitSub('pulseListUpdated', this.gameId, this, 'delete');
    }

    public getBasePulseData(): PulseData {
        return {
            id: this.id,
            name: this.name,
            pulseData: this.pulseData,
        };
    }

    public static async update(db: DataSource, gameId: string, pulseList: PulseData[]): Promise<void> {
        const repo = db.getRepository(CustomPulseModel);
        const existingPulses = await repo.find({
            where: { gameId },
            select: ['id'],
        });

        let shouldRemove: string[] = [];
        let shouldAdd: PulseData[] = [];

        const existingPulseIds = new Set(existingPulses.map(p => p.id));
        const newPulseIds = new Set(pulseList.map(p => p.id));

        for (const pulse of pulseList) {
            if (!existingPulseIds.has(pulse.id)) {
                shouldAdd.push(pulse);
            }
        }

        for (const pulse of existingPulses) {
            if (!newPulseIds.has(pulse.id)) {
                shouldRemove.push(pulse.id);
            }
        }

        await db.transaction(async (transactionalEntityManager) => {
            const repo = transactionalEntityManager.getRepository(CustomPulseModel);

            await repo.delete({
                id: In(shouldRemove),
                gameId: gameId,
            });

            if (shouldAdd.length > 0) {
                const newPulses = shouldAdd.map(pulse => {
                    const newPulse = new CustomPulseModel();
                    newPulse.id = pulse.id;
                    newPulse.gameId = gameId;
                    newPulse.name = pulse.name;
                    newPulse.pulseData = pulse.pulseData;
                    newPulse.createdAt = new Date();
                    return newPulse;
                });
                await repo.save(newPulses);
            }
        });
    }
}