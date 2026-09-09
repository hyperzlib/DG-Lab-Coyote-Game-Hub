import type { RouterContext } from '@koa/router';
import { v4 as uuid } from 'uuid';
import { routeConfig, responses, body } from '@hyperzlib/koa-swagger-decorator';
import { PassThrough } from 'stream';
import { z } from 'zod';

import {
    McpRequestSchema,
    McpResponseSchema,
    MCP_ERROR_CODES,
    MCP_METHODS,
    InitializeRequestParamsSchema,
    ToolsCallParamsSchema,
    ResourcesReadParamsSchema,
    SetStrengthParamsSchema,
    IncreaseStrengthParamsSchema,
    DecreaseStrengthParamsSchema,
    SetPulseParamsSchema,
    FireActionParamsSchema,
    type McpRequest,
    type McpResponse,
    type GameStatus,
    type Tool
} from './schemas/McpApi.js';
import { ConnectGameRequestSchema } from './schemas/LegacyGameApi.js';
import { CoyoteGameManager } from '#app/managers/CoyoteGameManager.js';
import { CoyoteGameConfigService, GameConfigType } from '#app/services/CoyoteGameConfigService.js';
import { getAvailableGamePulses, getFireChannelRestriction, normalizeFireAction, setGamePulse } from '#app/services/GameApiShared.js';
import { CoyoteGameController } from '../game/CoyoteGameController.js';
import { GameFireAction } from '../game/actions/GameFireAction.js';

export class SSESession {
    private controller: typeof McpApiController;

    public connectionId: string;
    public stream: PassThrough;
    public gameId?: string;
    public subscribedResources: Set<string> = new Set();

    public constructor(controller: typeof McpApiController, connectionId: string, stream: PassThrough) {
        this.controller = controller;

        this.connectionId = connectionId;
        this.stream = stream;
    }

    public toJSON() {
        return {
            connectionId: this.connectionId,
            gameId: this.gameId,
            subscribedResources: Array.from(this.subscribedResources)
        };
    }

    public sendEvent(event: {
        id?: string;
        event?: string;
        data: any;
        retry?: number;
    }) {
        return this.controller.sendSSEEvent(this.connectionId, event);
    }

    public bindGame(gameId: string) {
        if (this.gameId === gameId) {
            return;
        } else if (this.gameId) {
            // 如果连接已经绑定到其他游戏，先解绑
            this.unbindGame();
        }

        const connections = this.controller.gameEventListeners.get(gameId) || new Set();
        connections.add(this.connectionId);
        this.controller.gameEventListeners.set(gameId, connections);

        this.gameId = gameId;
        this.controller.observeGame(this.controller.getGameForObservation(gameId));
    }

    public unbindGame() {
        if (!this.gameId) {
            return;
        }

        const connections = this.controller.gameEventListeners.get(this.gameId);
        if (connections) {
            connections.delete(this.connectionId);
            if (connections.size === 0) {
                this.controller.gameEventListeners.delete(this.gameId);
            }
        }

        this.gameId = undefined;
    }

    public subscribeResource(resourceUri: string) {
        resourceUri = this.controller.normalizeResourceUri(resourceUri);
        if (this.subscribedResources.has(resourceUri)) {
            return;
        }

        const listeners = this.controller.resourceEventListeners.get(resourceUri) || new Set();
        listeners.add(this.connectionId);
        this.controller.resourceEventListeners.set(resourceUri, listeners);

        this.subscribedResources.add(resourceUri);
    }

    public unsubscribeResource(resourceUri: string) {
        resourceUri = this.controller.normalizeResourceUri(resourceUri);
        if (!this.subscribedResources.has(resourceUri)) {
            return;
        }

        this.subscribedResources.delete(resourceUri);

        const listeners = this.controller.resourceEventListeners.get(resourceUri);
        if (listeners) {
            listeners.delete(this.connectionId);
            if (listeners.size === 0) {
                this.controller.resourceEventListeners.delete(resourceUri);
            }
        }
    }

    public unsubscribeAllResources() {
        for (const resourceUri of this.subscribedResources) {
            const listeners = this.controller.resourceEventListeners.get(resourceUri);
            if (listeners) {
                listeners.delete(this.connectionId);
                if (listeners.size === 0) {
                    this.controller.resourceEventListeners.delete(resourceUri);
                }
            }
        }
        this.subscribedResources.clear();
    }

    public isSubscribedToResource(resourceUri: string): boolean {
        return this.subscribedResources.has(resourceUri);
    }

    public emitResourceUpdate(resourceUri: string) {
        if (!this.isSubscribedToResource(resourceUri)) {
            return;
        }

        this.sendEvent({
            event: 'message',
            data: {
                method: 'notifications/resources/updated',
                params: {
                    uri: resourceUri,
                }
            }
        });
    }

    public handleConnectionClose() {
        this.unbindGame();
        this.unsubscribeAllResources();
    }
}

export class McpApiController {
    // SSE 连接管理
    public static sseConnections = new Map<string, SSESession>();
    public static gameEventListeners = new Map<string, Set<string>>();
    public static resourceEventListeners = new Map<string, Set<string>>();
    private static observedGames = new Set<string>();

    public static getGameForObservation(gameId: string): CoyoteGameController | undefined {
        return CoyoteGameManager.instance.getGame(gameId);
    }

    public static observeGame(game: CoyoteGameController | undefined) {
        if (!game || this.observedGames.has(game.clientId)) {
            return;
        }

        this.observedGames.add(game.clientId);
        const notify = () => {
            this.notifyResourceUpdate(game.clientId).catch(error => {
                console.error('Failed to notify MCP resource update:', error);
            });
        };
        game.on('strengthChanged', notify);
        game.on('clientConnected', notify);
        game.on('clientDisconnected', notify);
        game.on('gameStarted', notify);
        game.on('gameStopped', notify);
        game.once('close', () => {
            this.observedGames.delete(game.clientId);
            CoyoteGameConfigService.instance.off('configUpdated', game.clientId, notify);
        });
        CoyoteGameConfigService.instance.on('configUpdated', game.clientId, notify);
    }

    /**
     * 添加SSE连接
     */
    private static addSSEConnection(connectionId: string, stream: PassThrough): SSESession {
        var session = new SSESession(this, connectionId, stream);
        this.sseConnections.set(connectionId, session);

        // 连接关闭时清理
        stream.on('close', () => {
            this.removeSSEConnection(connectionId);
        });

        return session;
    }

    /**
     * 移除SSE连接
     */
    private static removeSSEConnection(connectionId: string) {
        const sseConnection = this.sseConnections.get(connectionId);
        sseConnection?.handleConnectionClose();

        this.sseConnections.delete(connectionId);
    }

    /**
     * 发送SSE事件
     */
    public static sendSSEEvent(connectionId: string, event: {
        id?: string;
        event?: string;
        data: any;
        retry?: number;
    }) {
        const session = this.sseConnections.get(connectionId);
        if (!session) return;

        try {
            let message = '';

            if (event.id) {
                message += `id: ${event.id}\n`;
            }

            if (event.event) {
                message += `event: ${event.event}\n`;
            }

            const data = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
            message += `data: ${data}\n`;

            if (event.retry) {
                message += `retry: ${event.retry}\n`;
            }

            message += '\n';

            session.stream.write(message);
        } catch (error) {
            console.error('Error sending SSE event:', error);
            this.removeSSEConnection(connectionId);
        }
    }

    /**
     * 发送资源更新通知
     */
    private static async notifyResourceUpdate(gameId: string) {
        for (const resourceUri of ['game://strength.json', 'game://strength.md']) {
            const listeners = this.resourceEventListeners.get(resourceUri);
            if (listeners) {
                for (const connectionId of listeners) {
                    const session = this.sseConnections.get(connectionId);
                    if (session?.gameId !== gameId) {
                        continue;
                    }
                    this.sendSSEEvent(connectionId, {
                        event: 'message',
                        data: {
                            method: 'notifications/resources/updated',
                            params: { uri: resourceUri }
                        }
                    });
                }
            }
        }

        console.log(`Resources updated for game: ${gameId}`);
    }

    public static normalizeResourceUri(uri: string): string {
        return uri === 'game://strength' ? 'game://strength.json' : uri;
    }

    /**
     * 创建 MCP 成功响应
     */
    private static createSuccessResponse(id: string | number | null, result: any): McpResponse {
        return {
            jsonrpc: "2.0",
            id,
            result
        };
    }

    /**
     * 创建 MCP 错误响应
     */
    private static createErrorResponse(id: string | number | null, code: number, message: string, data?: any): McpResponse {
        return {
            jsonrpc: "2.0",
            id,
            error: {
                code,
                message,
                data
            }
        };
    }

    /**
     * 处理标准MCP初始化
     */
    private static async handleInitialize(params: any) {
        const { protocolVersion, capabilities, clientInfo } = InitializeRequestParamsSchema.parse(params);

        // 支持的协议版本
        const supportedVersions = ["2025-03-26", "2025-06-18"];
        let negotiatedVersion = protocolVersion;

        // 如果客户端版本不支持，使用我们支持的最新版本
        if (!supportedVersions.includes(protocolVersion)) {
            negotiatedVersion = supportedVersions[0]!;
        }

        return {
            protocolVersion: negotiatedVersion,
            capabilities: {
                tools: {
                    listChanged: false
                },
                resources: {
                    subscribe: true,
                    listChanged: true
                },
                logging: {}
            },
            serverInfo: {
                name: "coyote-game-hub-mcp-server",
                title: "Coyote Game Hub MCP Server",
                version: "2.1.0"
            },
            instructions: `这是用于控制 DG-Lab 郊狼电击设备的 MCP 服务器。

**推荐工作流：**
1. 订阅资源 \`\`\`game://strength.md\`\`\` 或 \`\`\`game://strength.json\`\`\` 了解当前绑定游戏的状态，包括：通道是否连接、实际强度、配置强度、各通道上限、当前波形和 B 通道模式。如果没有订阅资源功能，则在每次回复前调用 get_game_status 获取状态。
2. 根据需要调用强度/波形/开火工具

**关键约束：**
- 设备可用强度范围 0-200，但实际上限由用户设备的 strengthLimit 决定，A通道和B通道有各自独立的强度和上限
- B 通道仅在 bChannel.mode 为 'discrete' 时可独立设置强度；'off' 表示关闭，'sync' 表示跟随 A 通道
- fire_action 是在当前强度基础上叠加临时提升，而非设置绝对值`
        };
    }

    /**
     * 处理工具列表请求
     */
    private static async handleToolsList(specifiedGame: boolean = false) {
        let tools: Tool[] = []

        if (!specifiedGame) {
            tools.push(...[
                {
                    name: "connect_game",
                    description: "连接到指定的游戏（电击控制器）",
                    inputSchema: {
                        type: "object" as const,
                        properties: {
                            gameId: {
                                type: "string",
                                description: "游戏控制码，一串16进制uuid字符串"
                            }
                        },
                        required: ["gameId"]
                    }
                },
                {
                    name: "disconnect_game",
                    description: "断开与当前游戏的连接",
                    inputSchema: {
                        type: "object" as const,
                        properties: {}
                    }
                },
            ]);
        }

        tools.push(...[
            {
                name: "get_game_status",
                description: "获取当前游戏的状态信息，包括连接状态、当前电击强度等",
                inputSchema: {
                    type: "object" as const,
                    properties: {}
                }
            },
            {
                name: "set_strength",
                description: "将指定通道强度设置为精确值。注意：强度会被自动 clamp 到该通道的 strengthLimit，建议先获取当前状态确认 strengthLimit 后再设置强度",
                inputSchema: {
                    type: "object" as const,
                    properties: {
                        channel: {
                            type: "string",
                            enum: ["aChannel", "bChannel"],
                            description: "要设置强度的通道，aChannel 表示 A 通道，bChannel 表示 B 通道"
                        },
                        strength: {
                            type: "number",
                            description: "强度值(0-200)",
                            minimum: 0,
                            maximum: 200
                        }
                    },
                    required: ["channel", "strength"]
                }
            },
            {
                name: "increase_strength",
                description: "增加指定通道的电击强度",
                inputSchema: {
                    type: "object" as const,
                    properties: {
                        channel: {
                            type: "string",
                            enum: ["aChannel", "bChannel"],
                            description: "要增加强度的通道，aChannel 表示 A 通道，bChannel 表示 B 通道"
                        },
                        amount: {
                            type: "number",
                            description: "增加的强度值(1-200)",
                            minimum: 1,
                            maximum: 200
                        }
                    },
                    required: ["channel", "amount"]
                }
            },
            {
                name: "decrease_strength",
                description: "减少指定通道的电击强度",
                inputSchema: {
                    type: "object" as const,
                    properties: {
                        channel: {
                            type: "string",
                            enum: ["aChannel", "bChannel"],
                            description: "要减少强度的通道，aChannel 表示 A 通道，bChannel 表示 B 通道"
                        },
                        amount: {
                            type: "number",
                            description: "减少的强度值(1-200)",
                            minimum: 1,
                            maximum: 200
                        }
                    },
                    required: ["channel", "amount"]
                }
            },
            {
                name: "set_pulse",
                description: "设置指定通道的电击波形",
                inputSchema: {
                    type: "object" as const,
                    properties: {
                        channel: {
                            type: "string",
                            enum: ["aChannel", "bChannel"],
                            description: "要设置波形的通道，aChannel 表示 A 通道，bChannel 表示 B 通道"
                        },
                        pulseId: {
                            oneOf: [
                                { type: "string" },
                                { type: "array", items: { type: "string" }, minItems: 1 }
                            ],
                            description: "波形ID或波形ID列表"
                        }
                    },
                    required: ["channel", "pulseId"]
                }
            },
            {
                name: "fire_action",
                description: "对指定通道执行一键开火动作，在当前强度基础上叠加临时提升，持续一段时间后恢复到原强度。B通道只有在discrete独立模式下允许单独开火；sync和off模式请使用all或aChannel。一般不建议超过30，但以用户要求为准",
                inputSchema: {
                    type: "object" as const,
                    properties: {
                        channel: {
                            type: "string",
                            enum: ["aChannel", "bChannel", "all"],
                            description: "要执行开火的通道，aChannel 表示 A 通道，bChannel 表示 B 通道，all 表示两个通道"
                        },
                        strength: {
                            type: "number",
                            description: "一键开火强度(推荐1-30，但以用户要求为准)",
                            minimum: 0,
                            maximum: 200
                        },
                        duration: {
                            type: "number",
                            description: "持续时间(毫秒)",
                            minimum: 1,
                            default: 5000
                        },
                        override: {
                            type: "boolean",
                            description: "是否覆盖当前开火剩余时间",
                            default: false
                        },
                        pulseId: {
                            type: "string",
                            description: "指定波形ID(可选)"
                        }
                    },
                    required: ["channel", "strength"]
                }
            },
            {
                name: "get_pulse_list",
                description: "获取可用的电击波形列表",
                inputSchema: {
                    type: "object" as const,
                    properties: {}
                }
            },
            /*
            {
                name: "get_resources_list",
                description: "获取可用资源列表",
                inputSchema: {
                    type: "object" as const,
                    properties: {}
                }
            },
            {
                name: "get_resource",
                description: "获取指定资源的详细信息",
                inputSchema: {
                    type: "object" as const,
                    properties: {
                        uri: {
                            type: "string",
                            description: "资源URI"
                        }
                    },
                    required: ["uri"]
                }
            }
            */
        ]);


        return { tools };
    }

    /**
     * 处理工具调用请求
     */
    private static async handleToolsCall(session: SSESession, params: any) {
        const { name, arguments: args = {} } = ToolsCallParamsSchema.parse(params);

        try {
            let result: any;

            switch (name) {
                case "connect_game":
                    result = await this.handleConnectGame(session, { gameId: args.gameId });
                    break;
                case "disconnect_game":
                    result = await this.handleDisconnectGame(session);
                    break;
                case "get_game_status":
                    result = await this.handleGetGameStatus(session, {});
                    break;
                case "set_strength":
                    result = await this.handleSetStrength(session, { channel: args.channel, strength: args.strength });
                    break;
                case "increase_strength":
                    result = await this.handleIncreaseStrength(session, { channel: args.channel, amount: args.amount });
                    break;
                case "decrease_strength":
                    result = await this.handleDecreaseStrength(session, { channel: args.channel, amount: args.amount });
                    break;
                case "set_pulse":
                    result = await this.handleSetPulse(session, { channel: args.channel, pulseId: args.pulseId });
                    break;
                case "fire_action":
                    result = await this.handleFireAction(session, {
                        channel: args.channel,
                        strength: args.strength,
                        duration: args.duration,
                        override: args.override,
                        pulseId: args.pulseId
                    });
                    break;
                case "get_pulse_list":
                    result = await this.handleGetPulseList(session, {});
                    break;
                case "get_resources_list":
                    result = await this.handleResourcesList(session);
                    break;
                case "get_resource":
                    result = await this.handleResourcesRead(session, {
                        uri: args.uri
                    });
                    break;
                default:
                    throw {
                        code: MCP_ERROR_CODES.METHOD_NOT_FOUND,
                        message: `工具 '${name}' 不存在`
                    };
            }

            return {
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify(result, null, 2)
                    }
                ]
            };
        } catch (error: any) {
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `错误: ${error.message || error}`
                    }
                ],
                isError: true
            };
        }
    }

    /**
     * 验证游戏是否存在
     */
    private static validateGame(gameId?: string): { valid: boolean; game?: CoyoteGameController; error?: { code: number; message: string } } {
        if (!gameId) {
            return {
                valid: false,
                error: {
                    code: MCP_ERROR_CODES.GAME_NOT_CONNECTED,
                    message: "未连接到任何游戏，请先使用 connect_game 连接游戏"
                }
            };
        }

        const game = CoyoteGameManager.instance.getGame(gameId);
        if (!game) {
            return {
                valid: false,
                error: {
                    code: MCP_ERROR_CODES.GAME_NOT_FOUND,
                    message: `游戏 ${gameId} 不存在`
                }
            };
        }

        return { valid: true, game };
    }

    /**
     * 处理资源列表请求
     */
    private static async handleResourcesList(session: SSESession) {
        const resources = [
            {
                uri: `game://strength.json`,
                name: `当前电量状态`,
                description: "实时电量信息，包括当前强度、强度限制和随机强度范围，JSON格式",
                mimeType: "application/json"
            },
            {
                uri: `game://strength.md`,
                name: `当前电量状态（Markdown格式）`,
                description: "实时电量信息，包括当前强度、强度限制和随机强度范围",
                mimeType: "text/markdown"
            }
        ];

        return { resources };
    }

    /**
     * 处理资源读取请求
     */
    private static async handleResourcesRead(session: SSESession, params: any) {
        const { uri: requestedUri } = ResourcesReadParamsSchema.parse(params);
        const uri = this.normalizeResourceUri(requestedUri);
        const validation = this.validateGame(session.gameId);
        if (!validation.valid) {
            throw validation.error;
        }

        const game = validation.game!;
        const status = await this.getGameStatusSnapshot(session.gameId!, game);

        if (uri === 'game://strength.json') {
            return {
                contents: [{
                    uri,
                    mimeType: 'application/json',
                    text: JSON.stringify({ ...status, lastUpdated: new Date().toISOString() }, null, 2)
                }]
            };
        }

        if (uri === 'game://strength.md') {
            const bStatus = status.bChannel.mode === 'off'
                ? '已关闭'
                : status.bChannel.mode === 'sync'
                    ? '同步 A 通道'
                    : `当前强度 ${status.bChannel.currentStrength ?? 0} / 配置强度 ${status.bChannel.configuredStrength ?? 0} / 上限 ${status.bChannel.strengthLimit ?? 0}`;
            const markdownStrengthInfo =
                `**游戏ID (gameId)**: ${status.gameId}\n` +
                `**A通道 (aChannel)**: 实际强度 ${status.aChannel.currentStrength} / 配置强度 ${status.aChannel.configuredStrength} / 上限 ${status.aChannel.strengthLimit} (随机范围 ±${status.aChannel.randomStrengthRange})，当前波形 ${status.aChannel.currentPulseId || '未知'}\n` +
                `**B通道 (bChannel)**: ${bStatus}，模式 ${status.bChannel.mode}，当前波形 ${status.bChannel.currentPulseId || '未知'}\n` +
                `**连接状态 (isConnected)**: ${status.isConnected ? '已连接' : '未连接'}\n` +
                `**游戏状态 (isStarted)**: ${status.isStarted ? '已启动' : '未启动'}\n` +
                `**最后更新时间 (lastUpdated)**: ${new Date().toISOString()}`;

            return {
                contents: [{ uri, mimeType: 'text/markdown', text: markdownStrengthInfo }]
            };
        }

        throw {
            code: MCP_ERROR_CODES.METHOD_NOT_FOUND,
            message: `资源 '${uri}' 不存在`
        };

    }

    /**
     * 处理提示列表请求
     */
    private static async handlePromptsList(session: SSESession, params: any) {
        return {
            prompts: []
        };
    }

    /**
     * 处理资源订阅请求
     */
    private static async handleResourcesSubscribe(session: SSESession, params: any) {
        let { uri } = z.object({
            uri: z.string().url()
        }).parse(params);
        uri = this.normalizeResourceUri(uri);

        // 订阅资源
        session.subscribeResource(uri);

        return {
            success: true,
            message: `已订阅资源 ${uri}`
        };
    }

    /**
     * 处理资源取消订阅请求
     */
    private static async handleResourcesUnsubscribe(session: SSESession, params: any) {
        let { uri } = z.object({
            uri: z.string().url()
        }).parse(params);
        uri = this.normalizeResourceUri(uri);

        // 取消订阅资源
        session.unsubscribeResource(uri);

        return {
            success: true,
            message: `已取消订阅资源 ${uri}`
        };
    }

    /**
     * 将 MCP 通道枚举映射到内部通道名
     */
    private static mcpChannelToInternal(channel: 'aChannel' | 'bChannel'): 'main' | 'channelB' {
        return channel === 'aChannel' ? 'main' : 'channelB';
    }

    /**
     * 验证 B 通道是否可独立控制（bChannelMode 必须为 'discrete'）
     */
    private static async validateBChannelControllable(gameId: string): Promise<void> {
        const gameConfig = await CoyoteGameConfigService.instance.get(gameId, GameConfigType.MainGame);
        switch (gameConfig?.bChannelMode) {
            case 'off':
                throw {
                    code: MCP_ERROR_CODES.OPERATION_FAILED,
                    message: `B 通道当前已关闭，无法控制。如需控制，需要用户将 B 通道模式设置为 '独立控制'。`
                };
            case 'sync':
                throw {
                    code: MCP_ERROR_CODES.OPERATION_FAILED,
                    message: `B 通道当前模式为与 A 通道同步，无法独立控制。如需控制，需要用户将 B 通道模式设置为 '独立控制'。`
                };
        }
    }

    /**
     * 获取强度状态的自然语言描述
     */
    private static getStrengthStatusMessage(game: CoyoteGameController, operation: string, channel: 'main' | 'channelB' = 'main', oldStrength?: number, newStrength?: number): string {
        const channelConfig = game.strengthConfig[channel];
        const channelClient = game.clientStrength[channel];
        const current = newStrength ?? channelConfig?.strength ?? 0;
        const limit = channelClient?.limit ?? 20;
        const random = channelConfig?.randomStrength ?? 0;
        const started = game.running ? "已启动" : "未启动";
        const channelName = channel === 'main' ? 'A通道' : 'B通道';

        let message = `${operation}成功。`;
        if (oldStrength !== undefined && newStrength !== undefined) {
            message += `强度从 ${oldStrength} 调整到 ${newStrength}。`;
        }
        message += `通道：${channelName}，当前强度: ${current}/上限: ${limit}，随机强度范围: ±${random}，电击状态: ${started}。`;

        let strengthPercentage = limit !== 0 ? (current / limit) * 100 : 0;

        if (strengthPercentage === 0) {
            message += " 当前没有电击输出。";
        } else if (strengthPercentage < 25) {
            message += " 当前电击强度较低。";
        } else if (strengthPercentage < 50) {
            message += " 当前电击强度中等。";
        } else if (strengthPercentage < 75) {
            message += " 当前电击强度较高。";
        } else {
            message += " 当前电击强度很高！";
        }

        return message;
    }

    private static async handleConnectGame(session: SSESession, params: any) {
        const { gameId } = ConnectGameRequestSchema.parse(params);
        if (!gameId) {
            throw {
                code: MCP_ERROR_CODES.INVALID_PARAMS,
                message: "游戏ID不能为空"
            };
        }

        const validation = this.validateGame(gameId);
        if (!validation.valid) {
            throw validation.error;
        }

        // 连接到游戏
        session.bindGame(gameId);

        return {
            success: true,
            gameId,
            message: `成功连接到游戏（郊狼控制器） ${gameId}.`
        };
    }

    private static async handleDisconnectGame(session: SSESession) {
        session.unbindGame();
        return {
            success: true
        };
    }

    /**
     * 获取游戏状态
     */
    private static async getGameStatusSnapshot(gameId: string, game: CoyoteGameController): Promise<GameStatus> {
        const gameConfig = game.gameConfig;
        const currentPulseId = (channel: 'main' | 'channelB') =>
            game.pulsePlayList[channel]?.getCurrentPulseId() ||
            (typeof gameConfig.pulse[channel].pulseId === 'string' ? gameConfig.pulse[channel].pulseId : gameConfig.pulse[channel].pulseId[0]) ||
            undefined;
        let hints: string[] = [];
        if (!game.client) hints.push("设备未连接，强度操作无效。");
        if (!game.running) hints.push("电击未启动。");
        if (gameConfig.bChannelMode !== 'discrete') {
            hints.push(`B 通道模式为 '${gameConfig.bChannelMode}'，无法独立调整 B 通道强度。`);
        }
        const aLimit = game.clientStrength.main.limit || 0;
        hints.push(`A 通道强度上限为 ${aLimit}，set_strength 的有效范围是 0-${aLimit}。`);

        const status: GameStatus = {
            gameId,
            isConnected: !!game.client,
            isStarted: !!game.running,
            aChannel: {
                currentStrength: game.clientStrength.main.strength || 0,
                configuredStrength: game.strengthConfig.main.strength || 0,
                randomStrengthRange: game.strengthConfig.main.randomStrength || 0,
                strengthLimit: game.clientStrength.main.limit || 0,
                currentPulseId: currentPulseId('main'),
            },
            bChannel: {
                mode: gameConfig.bChannelMode,
                currentStrength: game.clientStrength.channelB.strength || 0,
                configuredStrength: game.strengthConfig.channelB.strength || 0,
                randomStrengthRange: game.strengthConfig.channelB.randomStrength || 0,
                strengthLimit: game.clientStrength.channelB.limit || 0,
                currentPulseId: currentPulseId('channelB'),
                strengthMultiplier: gameConfig.bChannelStrengthMultiplier,
            },
            currentPulseId: currentPulseId('main'),
            message: '获取游戏状态成功。' + hints.join(' '),
        };

        return status;
    }

    private static async handleGetGameStatus(session: SSESession, params: any): Promise<GameStatus> {
        const validation = this.validateGame(session.gameId);
        if (!validation.valid) {
            throw validation.error;
        }

        return this.getGameStatusSnapshot(session.gameId!, validation.game!);
    }

    /**
     * 设置强度
     */
    private static async handleSetStrength(session: SSESession, params: any) {
        const validation = this.validateGame(session.gameId);
        if (!validation.valid) {
            throw validation.error;
        }

        let { channel, strength } = SetStrengthParamsSchema.parse(params);
        const internalChannel = this.mcpChannelToInternal(channel);

        if (channel === 'bChannel') {
            await this.validateBChannelControllable(session.gameId!);
        }

        if (strength < 0 || strength > 200) {
            throw {
                code: MCP_ERROR_CODES.INVALID_STRENGTH,
                message: `强度值必须在 0-200 之间，当前值: ${strength}`
            };
        }

        // 获取游戏实例
        const game = CoyoteGameManager.instance.getGame(session.gameId!);
        if (!game) {
            throw {
                code: MCP_ERROR_CODES.GAME_NOT_FOUND,
                message: `游戏 ${session.gameId} 不存在`
            };
        }

        const oldStrength = game.strengthConfig?.[internalChannel]?.strength || 0;

        strength = Math.min(Math.max(strength, 0), game.clientStrength[internalChannel].limit); // 确保强度不超过限制

        // 设置强度
        await game.updateStrengthConfig({
            strength: strength,
            randomStrength: game.strengthConfig[internalChannel].randomStrength,
        }, internalChannel);

        // 发送资源更新通知
        await this.notifyResourceUpdate(session.gameId!);

        return {
            success: true,
            channel,
            oldStrength,
            newStrength: strength,
            strengthLimit: game.clientStrength[internalChannel].limit,
            randomStrength: game.strengthConfig[internalChannel].randomStrength || 0,
            message: this.getStrengthStatusMessage(game, "设置电量", internalChannel, oldStrength, strength)
        };
    }

    /**
     * 增加强度
     */
    private static async handleIncreaseStrength(session: SSESession, params: any) {
        const validation = this.validateGame(session.gameId!);
        if (!validation.valid) {
            throw validation.error;
        }

        const { channel, amount } = IncreaseStrengthParamsSchema.parse(params);
        const internalChannel = this.mcpChannelToInternal(channel);

        if (channel === 'bChannel') {
            await this.validateBChannelControllable(session.gameId!);
        }

        const game = CoyoteGameManager.instance.getGame(session.gameId!);
        if (!game) {
            throw {
                code: MCP_ERROR_CODES.GAME_NOT_FOUND,
                message: `游戏 ${session.gameId} 不存在`
            };
        }

        const oldStrength = game.strengthConfig?.[internalChannel]?.strength || 0;
        const strength = Math.min(Math.max(oldStrength + amount, 0), game.clientStrength[internalChannel].limit);

        // 设置强度
        await game.updateStrengthConfig({
            strength: strength,
            randomStrength: game.strengthConfig[internalChannel].randomStrength,
        }, internalChannel);

        // 发送资源更新通知
        await this.notifyResourceUpdate(session.gameId!);

        return {
            success: true,
            channel,
            oldStrength,
            newStrength: strength,
            strengthLimit: game.clientStrength[internalChannel].limit,
            randomStrength: game.strengthConfig[internalChannel].randomStrength || 0,
            message: this.getStrengthStatusMessage(game, "增加电量", internalChannel, oldStrength, strength)
        };
    }

    /**
     * 减少强度
     */
    private static async handleDecreaseStrength(session: SSESession, params: any) {
        const validation = this.validateGame(session.gameId!);
        if (!validation.valid) {
            throw validation.error;
        }

        const { channel, amount } = DecreaseStrengthParamsSchema.parse(params);
        const internalChannel = this.mcpChannelToInternal(channel);

        if (channel === 'bChannel') {
            await this.validateBChannelControllable(session.gameId!);
        }

        const game = CoyoteGameManager.instance.getGame(session.gameId!);
        if (!game) {
            throw {
                code: MCP_ERROR_CODES.GAME_NOT_FOUND,
                message: `游戏 ${session.gameId} 不存在`
            };
        }

        const oldStrength = game.strengthConfig?.[internalChannel]?.strength || 0;
        const strength = Math.min(Math.max(oldStrength - amount, 0), game.clientStrength[internalChannel].limit);

        // 设置强度
        await game.updateStrengthConfig({
            strength: strength,
            randomStrength: game.strengthConfig[internalChannel].randomStrength,
        }, internalChannel);

        // 发送资源更新通知
        await this.notifyResourceUpdate(session.gameId!);

        return {
            success: true,
            channel,
            oldStrength,
            newStrength: strength,
            strengthLimit: game.clientStrength[internalChannel].limit,
            randomStrength: game.strengthConfig[internalChannel].randomStrength || 0,
            message: this.getStrengthStatusMessage(game, "减少电量", internalChannel, oldStrength, strength)
        };
    }

    /**
     * 设置波形
     */
    private static async handleSetPulse(session: SSESession, params: any) {
        const validation = this.validateGame(session.gameId!);
        if (!validation.valid) {
            throw validation.error;
        }

        const { channel, pulseId } = SetPulseParamsSchema.parse(params);
        const internalChannel = this.mcpChannelToInternal(channel);

        const pulseList = await getAvailableGamePulses(session.gameId!);
        const pulseIds = Array.isArray(pulseId) ? pulseId : [pulseId];
        const missingPulseId = pulseIds.find((id: string) => !pulseList.some(pulse => pulse.id === id));

        if (missingPulseId) {
            throw {
                code: MCP_ERROR_CODES.INVALID_PULSE_ID,
                message: `波形 ${missingPulseId} 不存在`
            };
        }

        // 更新游戏配置（通道特定的波形配置）
        await setGamePulse(session.gameId!, internalChannel, pulseId);
        await this.notifyResourceUpdate(session.gameId!);

        return {
            success: true,
            channel,
            newPulseId: pulseId
        };
    }

    /**
     * 开火动作
     */
    private static async handleFireAction(session: SSESession, params: any) {
        const validation = this.validateGame(session.gameId!);
        if (!validation.valid) {
            throw validation.error;
        }

        const { channel, strength, duration = 5000, override = false, pulseId } = FireActionParamsSchema.parse(params);
        // 映射 MCP 通道到内部通道枚举
        const internalChannel = channel === 'aChannel' ? 'main' : channel === 'bChannel' ? 'channelB' : 'all';

        const game = validation.game;
        if (!game) {
            throw {
                code: MCP_ERROR_CODES.GAME_NOT_CONNECTED,
                message: `游戏 ${session.gameId} 未连接`
            };
        }

        const fireRestriction = getFireChannelRestriction(internalChannel, game.gameConfig.bChannelMode);
        if (fireRestriction) {
            throw {
                code: MCP_ERROR_CODES.OPERATION_FAILED,
                message: fireRestriction.message,
            };
        }

        const fireParams = normalizeFireAction(duration, override);
        const actualDuration = fireParams.actualDuration;
        const warnings: { code: string, message: string }[] = [...fireParams.warnings];

        // 生成开火 ID
        const fireActionId = `fire_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            // 创建开火动作
            const fireAction = new GameFireAction({
                channel: internalChannel,
                strength,
                time: actualDuration,
                pulseId: pulseId,
                updateMode: fireParams.updateMode,
            });

            await game.startAction(fireAction);

            // 发送资源更新通知
            await this.notifyResourceUpdate(session.gameId!);

            return {
                success: true,
                fireActionId,
                actualDuration,
                warnings: warnings.length > 0 ? warnings : undefined,
                message: `开火动作已启动！强度: ${strength}，持续时间: ${actualDuration}ms。${this.getStrengthStatusMessage(game, "开火动作", internalChannel === 'all' ? 'main' : internalChannel)}`
            };
        } catch (error) {
            throw {
                code: MCP_ERROR_CODES.OPERATION_FAILED,
                message: `开火操作失败: ${error}`
            };
        }
    }

    /**
     * 获取波形列表
     */
    private static async handleGetPulseList(session: SSESession, params: any) {
        const validation = this.validateGame(session.gameId);
        if (!validation.valid) {
            throw validation.error;
        }
        const pulseList = await getAvailableGamePulses(session.gameId!);

        return {
            pulses: pulseList.map((pulse: any) => ({
                id: pulse.id,
                name: pulse.name
            }))
        };
    }

    /**
     * SSE 连接端点
     */
    @routeConfig({
        method: 'get',
        path: '/api/mcp',
        summary: 'MCP SSE Api',
        operationId: 'MCP SSE Api',
        tags: ['MCP V1'],
    })
    public async handleMcpSSEApi(ctx: RouterContext): Promise<void> {
        // console.log('MCP API 连接:', ctx.header, ctx.params, ctx.query);
        const connectionId = uuid();

        // 设置SSE响应头
        ctx.set({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
        });

        // 创建PassThrough流
        const stream = new PassThrough();
        ctx.body = stream;

        // 添加连接到管理器
        const session = McpApiController.addSSEConnection(connectionId, stream);

        if (ctx.params.gameId) {
            // 如果有游戏ID，绑定连接到游戏
            const gameId = ctx.params.gameId;
            session.bindGame(gameId);
        }

        // 发送初始连接事件
        session.sendEvent({
            event: 'endpoint',
            data: `/api/mcp?session_id=${connectionId}`,
        });

        // 定期发送心跳
        const heartbeat = setInterval(() => {
            session.sendEvent({
                event: 'heartbeat',
                data: { timestamp: new Date().toISOString() }
            });
        }, 30000); // 每30秒发送心跳

        // 连接关闭清理
        ctx.req.on('close', () => {
            clearInterval(heartbeat);
            McpApiController.removeSSEConnection(connectionId);
        });

        ctx.req.on('error', () => {
            clearInterval(heartbeat);
            McpApiController.removeSSEConnection(connectionId);
        });
    }


    @routeConfig({
        method: 'get',
        path: '/api/mcp/{gameId}',
        summary: 'MCP SSE Api with Game ID Present',
        operationId: 'MCP SSE Api with Game ID',
        tags: ['MCP V1'],
        request: {
            params: z.object({
                gameId: z.string().optional(),
            }),
        }
    })
    public async handleMcpSSEApiWithGameId(ctx: RouterContext): Promise<void> {
        await this.handleMcpSSEApi(ctx);
    }

    /**
     * MCP API 消息处理器
     */
    @routeConfig({
        method: 'post',
        path: '/api/mcp',
        summary: 'MCP Message Handler',
        operationId: 'MCP Message Handler',
        tags: ['MCP V1'],
        request: {
            query: z.object({
                session_id: z.string(),
            }),
        }
    })
    @body(McpRequestSchema)
    @responses(McpResponseSchema)
    public async mcpHandler(ctx: RouterContext): Promise<void> {
        // console.log('MCP API 请求:', ctx.method, ctx.path, ctx.params, ctx.query, ctx.request.body);
        const sessionId = ctx.query.session_id as string;

        const session = McpApiController.sseConnections.get(sessionId);
        if (!session) {
            ctx.body = McpApiController.createErrorResponse(
                null,
                MCP_ERROR_CODES.SESSION_NOT_FOUND,
                `会话 ${sessionId} 不存在或已过期`
            );
            ctx.status = 404;
            return;
        }

        let requestBody: McpRequest;
        try {
            requestBody = McpRequestSchema.parse(ctx.request.body);
        } catch (error: any) {
            ctx.body = McpApiController.createErrorResponse(
                null,
                MCP_ERROR_CODES.INVALID_REQUEST,
                `请求格式错误: ${error.message}`,
                error.errors
            );
            ctx.status = 400;
            return;
        }

        let { id, method, params } = requestBody;
        id ??= 0;

        try {
            if (method.startsWith('notifications/')) {
                // 什么都不做，忽略通知
                ctx.body = '';
                ctx.status = 202; // 202 Accepted
                return;
            }

            let result: any = null;

            switch (method) {
                case MCP_METHODS.INITIALIZE:
                    result = await McpApiController.handleInitialize(params);
                    break;

                case MCP_METHODS.PING:
                    result = {}
                    break;

                case MCP_METHODS.TOOLS_LIST:
                    result = await McpApiController.handleToolsList(!!session.gameId);
                    break;

                case MCP_METHODS.TOOLS_CALL:
                    result = await McpApiController.handleToolsCall(session, params);
                    break;

                case MCP_METHODS.RESOURCES_LIST:
                    result = await McpApiController.handleResourcesList(session);
                    break;

                case MCP_METHODS.RESOURCES_READ:
                    result = await McpApiController.handleResourcesRead(session, params);
                    break;

                case MCP_METHODS.RESOURCES_SUBSCRIBE:
                    result = await McpApiController.handleResourcesSubscribe(session, params);
                    break;

                case MCP_METHODS.RESOURCES_UNSUBSCRIBE:
                    result = await McpApiController.handleResourcesUnsubscribe(session, params);
                    break;

                case MCP_METHODS.PROMPTS_LIST:
                    result = await McpApiController.handlePromptsList(session, params);
                    break;

                default:

                    ctx.body = McpApiController.createErrorResponse(
                        id,
                        MCP_ERROR_CODES.METHOD_NOT_FOUND,
                        `方法 '${method}' 不存在`
                    );
                    ctx.status = 404;
                    return;
            }

            session.sendEvent({
                event: 'message',
                data: McpApiController.createSuccessResponse(id, result)
            });

            ctx.body = '';
            ctx.status = 202; // 202 Accepted
        } catch (error: any) {
            if (error.code && error.message) {
                // 这是我们的自定义错误
                ctx.body = McpApiController.createErrorResponse(id, error.code, error.message, error.data);
            } else {
                // 未知错误
                ctx.body = McpApiController.createErrorResponse(
                    id,
                    MCP_ERROR_CODES.INTERNAL_ERROR,
                    '内部服务器错误',
                    error.message
                );
            }
            ctx.status = 500;
        }
    }
}
