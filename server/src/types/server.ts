export type RemoteNotificationInfo = {
    /** 通知标题 */
    title?: string;
    /** 通知内容 */
    message: string;
    /** 通知图标，需要是PrimeVue图标列表里的className */
    icon?: string;
    /** 通知类型 */
    severity?: 'success' | 'info' | 'warn' | 'error' | 'secondary' | 'contrast';
    /** 通知的ID，如果存在则此通知可以忽略 */
    ignoreId?: string;
    /** 阻止通知自动关闭 */
    sticky?: boolean;
    /** 点击通知后打开的URL */
    url?: string;
    /** 打开URL的按钮文本 */
    urlLabel?: string;
};