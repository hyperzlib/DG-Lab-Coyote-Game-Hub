import { z } from "koa-swagger-decorator";
import { DataSource } from "typeorm";

export const RemoteNotificationInfoSchema = z.object({
    /** 通知标题 */
    title: z.string().optional().describe('通知标题'),
    /** 通知内容 */
    message: z.string().describe('通知内容'),
    /** 通知图标，需要是PrimeVue图标列表里的className */
    icon: z.string().optional().describe('通知图标'),
    /** 通知类型 */
    severity: z.enum(['success', 'info', 'warn', 'error', 'secondary', 'contrast'])
        .optional()
        .describe('通知类型'),
    /** 通知的ID，如果存在则此通知可以忽略 */
    ignoreId: z.string().optional().describe('通知的ID，如果存在则此通知可以忽略'),
    /** 阻止通知自动关闭 */
    sticky: z.boolean().optional().default(false).describe('阻止通知自动关闭'),
    /** 点击通知后打开的URL */
    url: z.string().url().optional().describe('点击通知后打开的URL'),
    /** 打开URL的按钮文本 */
    urlLabel: z.string().optional().describe('打开URL的按钮文本'),
}).describe('远程通知信息');
export type RemoteNotificationInfo = z.infer<typeof RemoteNotificationInfoSchema>;

export type ServerContext = {
    database: DataSource;
};