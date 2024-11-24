import { ObjectUpdater } from "../../utils/ObjectUpdater";
import { CoyoteGamePlayConfig } from "../../types/gamePlay";

export class GamePlayConfigUpdater extends ObjectUpdater {
    protected registerSchemas(): void {
        this.addSchema(0, (obj) => obj, () => {
            return {
                gamePlayList: [],
            } as CoyoteGamePlayConfig;
        });
    }
}