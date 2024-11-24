import { ObjectUpdater } from "../../utils/ObjectUpdater";
import { GameCustomPulseConfig } from "../../types/game";

export class CustomPulseConfigUpdater extends ObjectUpdater {
    protected registerSchemas(): void {
        this.addSchema(0, (obj) => obj, () => {
            return {
                customPulseList: [],
            } as GameCustomPulseConfig;
        });
    }
}