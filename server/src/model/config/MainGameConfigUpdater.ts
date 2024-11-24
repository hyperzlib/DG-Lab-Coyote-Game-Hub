import { DGLabPulseService } from "../../services/DGLabPulse";
import { MainGameConfig } from "../../types/game";
import { ObjectUpdater } from "../../utils/ObjectUpdater";

export class MainGameConfigUpdater extends ObjectUpdater {
    protected registerSchemas(): void {
        this.addSchema(0, (obj) => obj, () => {
            return {
                strengthChangeInterval: [15, 30],
                enableBChannel: false,
                bChannelStrengthMultiplier: 1,
                pulseId: DGLabPulseService.instance.getDefaultPulse().id,
                pulseMode: 'single',
                pulseChangeInterval: 60,
            } as MainGameConfig;
        });
    }
}