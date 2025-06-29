import { z } from "koa-swagger-decorator";

export const CustomSkinParamSchema = z.object({
    prop: z.string().describe('参数名称'),
    type: z.enum(['boolean', 'int', 'float', 'string', 'select'])
        .describe('参数类型'),
    name: z.string().describe('参数显示名称'),
    help: z.string().optional().describe('参数帮助信息'),
}).describe('自定义皮肤参数');
export type CustomSkinParamDef = z.infer<typeof CustomSkinParamSchema>;

export const CustomSkinManifestSchema = z.object({
    name: z.string().describe('皮肤名称'),
    main: z.string().describe('皮肤主脚本文件路径'),
    help: z.string().optional().describe('皮肤帮助信息'),
    params: z.array(CustomSkinParamSchema).optional().describe('皮肤参数定义列表'),
}).describe('自定义皮肤信息');
export type CustomSkinManifest = z.infer<typeof CustomSkinManifestSchema>;

export const CustomSkinInfoSchema = CustomSkinManifestSchema.extend({
    url: z.string().describe('皮肤URL'),
}).describe('自定义皮肤信息（包含URL）');
export type CustomSkinInfo = z.infer<typeof CustomSkinInfoSchema>;