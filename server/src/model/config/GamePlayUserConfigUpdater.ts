import { ObjectUpdater } from "../../utils/ObjectUpdater";
import { CoyoteGamePlayUserConfig } from "../../types/gamePlay";

export class GamePlayUserConfigUpdater extends ObjectUpdater {
    protected registerSchemas(): void {
        this.addSchema(0, (obj) => obj, () => {
            return {
                configList: {},
            } as CoyoteGamePlayUserConfig;
        });
    }
}