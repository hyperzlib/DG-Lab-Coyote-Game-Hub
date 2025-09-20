import { GameModel } from "./GameModel.js"
import { GamePlayModel } from "./GamePlayModel.js";
import { CustomPulseModel } from "./CustomPulseModel.js";
import { generateUUIDWithValidation } from "#app/utils/utils.js";
import { And, DataSource, Or } from "typeorm";

export const ModelList = [
    GameModel,
    GamePlayModel,
    CustomPulseModel,
];

export async function generateConnectCode(database: DataSource): Promise<string> {
    return await generateUUIDWithValidation(async (generatedUuid) => {
        var num = await database.getRepository(GamePlayModel).countBy({ connectCode: generatedUuid });
        if (num > 0) {
            return false; // 如果已经存在，则返回false
        }

        num = await database.getRepository(GameModel).count({
            where: [
                { mainConnectCode: generatedUuid },
                { replicaConnectCode: generatedUuid }
            ]
        });
        return num === 0; // 如果不存在，则返回true
    });
}