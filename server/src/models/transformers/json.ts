import { ValueTransformer } from "typeorm";

export const ormLooseJsonTransformer: ValueTransformer = {
    to: (value: any): string | null => {
        return value ? JSON.stringify({ data: value }) : null;
    },
    from: (value: any | null): any => {
        if (value === null || value === undefined) {
            return null;
        }

        if (value?.$parsed) {
            // 如果已经解析过，直接返回原始数据
            return value;
        }

        const parsedData = (JSON.parse(value) ?? {}).data;
        if (parsedData === undefined || parsedData === null) {
            return null;
        }

        parsedData.$parsed = true; // 标记为已解析
        return parsedData;
    }
};