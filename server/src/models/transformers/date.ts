import { ValueTransformer } from "typeorm";

export const ormDateToNumberTransformer: ValueTransformer = {
    to: (value: Date | null): number | null => {
        return value ? Math.floor(value.getTime() / 1000) : null;
    },
    from: (value: number | null): Date | null => {
        return value ? new Date(value * 1000) : null;
    }
};