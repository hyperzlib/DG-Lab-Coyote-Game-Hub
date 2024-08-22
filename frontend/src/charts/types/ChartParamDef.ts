export type ChartParamDef = {
    prop: string;
    type: 'boolean' | 'int' | 'float' | 'string' | 'select';
    name: string;
    help?: string;
    options?: { value: string, label: string }[];
};