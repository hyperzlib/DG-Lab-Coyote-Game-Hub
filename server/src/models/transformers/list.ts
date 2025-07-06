import { ValueTransformer } from "typeorm";

export const ormNumberListToStringTransformer: ValueTransformer = {
    to: (value: number[] | null): string | null => {
        return value ? value.join(',') : null;
    },
    from: (value: string | null): number[] | null => {
        return value ? value.split(',').map(Number) : null;
    }
};

export const ormStringListToStringTransformer: ValueTransformer = {
    to: (value: string[] | null): string | null => {
        return value ? value.join(',') : null;
    },
    from: (value: string | null): string[] | null => {
        return value ? value.split(',').map(item => item.trim()) : null;
    }
};