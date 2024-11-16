export type CustomSkinParamDef = {
    prop: string;
    type: 'boolean' | 'int' | 'float' | 'string' | 'select';
    name: string;
    help?: string;
    options?: { value: string, label: string }[];
};

export type CustomSkinManifest = {
    name: string;
    main: string;
    help?: string;
    params?: CustomSkinParamDef[];
};