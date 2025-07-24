import Router from 'koa-router';
import { v4 as uuid } from 'uuid';
import { z } from 'koa-swagger-decorator';
import { routeConfig, responses, body } from 'koa-swagger-decorator';
import { PassThrough } from 'stream';

import {
    MCPRequestSchema,
    MCPResponseSchema,
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
    type MCPRequest as MCPRequest,
    type MCPResponse as MCPResponse,
    type GameStatus,
    Tool
} from './schemas/McpApi.js';
import { ConnectGameRequestSchema } from './schemas/GameApi.js';
import { CoyoteGameManager } from '#app/managers/CoyoteGameManager.js';
import { DGLabPulseService } from '#app/services/DGLabPulse.js';
import { CoyoteGameController } from '../game/CoyoteGameController.js';
import { GameModel } from '#app/models/GameModel.js';
import { LRUCache } from 'lru-cache';
import { firstHeader } from '#app/utils/utils.js';

type RouterContext = Router.RouterContext;

export class MCPConnection {
    private controller: typeof MCPApiController;

    public connectionId: string;
    public sessionId: string;
    public stream: PassThrough;
    public gameId?: string;
    public subscribedResources: Set<string> = new Set();

    public constructor(controller: typeof MCPApiController, connectionId: string, sessionId: string, stream: PassThrough) {
        this.controller = controller;

        this.connectionId = connectionId;
        this.sessionId = sessionId;
        this.stream = stream;

        const session = this.controller.mcpSessions.get(sessionId);
        if (session?.gameId) {
            this.bindGame(session.gameId);
        }
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

        this.updateSession({ gameId });
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
        this.updateSession({ gameId: undefined });
    }

    public subscribeResource(resourceUri: string) {
        if (this.subscribedResources.has(resourceUri)) {
            return;
        }
        
        const listeners = this.controller.resourceEventListeners.get(resourceUri) || new Set();
        listeners.add(this.connectionId);
        this.controller.resourceEventListeners.set(resourceUri, listeners);

        this.subscribedResources.add(resourceUri);
    }

    public unsubscribeResource(resourceUri: string) {
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

    public getSession(): MCPSession | undefined {
        return MCPApiController.mcpSessions.get(this.sessionId);
    }

    public setSession(sessionData: MCPSession) {
        MCPApiController.mcpSessions.set(this.sessionId, sessionData);
    }

    public updateSession(sessionData: Partial<MCPSession>) {
        const session = this.getSession() || {};
        const updatedSession = { ...session, ...sessionData };
        this.setSession(updatedSession);
    }

    public handleConnectionClose() {
        this.unbindGame();
        this.unsubscribeAllResources();
    }
}

export interface MCPSession {
    /** 连接的GameId */
    gameId?: string;
}

export class MCPApiController {
    // MCP 连接管理
    public static mcpConnections = new Map<string, MCPConnection>();
    public static mcpSessions = new LRUCache<string, MCPSession>({
        ttl: 1000 * 60 * 60, // 60 minutes
        ttlAutopurge: true,
    });

    public static gameEventListeners = new Map<string, Set<string>>();
    public static resourceEventListeners = new Map<string, Set<string>>();

    /**
     * 添加SSE连接
     */
    private static addSSEConnection(connectionId: string, sessionId: string, stream: PassThrough): MCPConnection {
        var session = new MCPConnection(this, connectionId, sessionId, stream);
        this.mcpConnections.set(connectionId, session);

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
        const sseConnection = this.mcpConnections.get(connectionId);
        sseConnection?.handleConnectionClose();

        this.mcpConnections.delete(connectionId);
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
        const session = this.mcpConnections.get(connectionId);
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
        const resourceUri = `game://${gameId}/strength`;

        // 向所有关注此游戏的连接发送资源更新事件
        const listeners = this.resourceEventListeners.get(resourceUri);
        if (listeners) {
            for (const connectionId of listeners) {
                this.sendSSEEvent(connectionId, {
                    event: 'message',
                    data: {
                        method: 'notifications/resources/updated',
                        params: {
                            uri: resourceUri,
                        }
                    }
                });
            }
        }

        console.log(`Resource updated: ${resourceUri}`);
    }

    /**
     * 创建 MCP 成功响应
     */
    private static createSuccessResponse(id: string | number | null, result: any): MCPResponse {
        return {
            jsonrpc: "2.0",
            id,
            result
        };
    }

    /**
     * 创建 MCP 错误响应
     */
    private static createErrorResponse(id: string | number | null, code: number, message: string, data?: any): MCPResponse {
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
    private static async handleInitialize(ctx: RouterContext, params: any) {
        const { protocolVersion, capabilities, clientInfo } = InitializeRequestParamsSchema.parse(params);

        // 支持的协议版本
        const supportedVersions = ["2025-03-26", "2025-06-18"];
        let negotiatedVersion = protocolVersion;

        // 如果客户端版本不支持，使用我们支持的最新版本
        if (!supportedVersions.includes(protocolVersion)) {
            negotiatedVersion = supportedVersions[0];
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
                version: "2.0.0"
            },
            instructions: "这是一个用于控制DG-Lab电击游戏的MCP服务器。使用tools/list查看可用工具，使用tools/call调用游戏控制功能。使用resources/list查看可用资源（如当前电量状态）。"
        };
    }

    /**
     * 处理工具列表请求
     */
    private static async handleToolsList(ctx: RouterContext, specifiedGame: boolean = false) {
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
                description: "设置当前的电击强度到指定值",
                inputSchema: {
                    type: "object" as const,
                    properties: {
                        strength: {
                            type: "number",
                            description: "强度值(0-200)",
                            minimum: 0,
                            maximum: 200
                        }
                    },
                    required: ["strength"]
                }
            },
            {
                name: "increase_strength",
                description: "增加电击强度",
                inputSchema: {
                    type: "object" as const,
                    properties: {
                        amount: {
                            type: "number",
                            description: "增加的强度值(1-200)",
                            minimum: 1,
                            maximum: 200
                        }
                    },
                    required: ["amount"]
                }
            },
            {
                name: "decrease_strength",
                description: "减少电击强度",
                inputSchema: {
                    type: "object" as const,
                    properties: {
                        amount: {
                            type: "number",
                            description: "减少的强度值(1-200)",
                            minimum: 1,
                            maximum: 200
                        }
                    },
                    required: ["amount"]
                }
            },
            {
                name: "set_pulse",
                description: "设置电击波形",
                inputSchema: {
                    type: "object" as const,
                    properties: {
                        pulseId: {
                            type: "string",
                            description: "波形ID"
                        }
                    },
                    required: ["pulseId"]
                }
            },
            {
                name: "fire_action",
                description: "执行一键开火动作，瞬间提高电击强度一段时间",
                inputSchema: {
                    type: "object" as const,
                    properties: {
                        strength: {
                            type: "number",
                            description: "一键开火强度(0-200)",
                            minimum: 0,
                            maximum: 200
                        },
                        duration: {
                            type: "number",
                            description: "持续时间(毫秒)",
                            minimum: 100,
                            maximum: 30000,
                            default: 5000
                        },
                        pulseId: {
                            type: "string",
                            description: "指定波形ID(可选)"
                        }
                    },
                    required: ["strength"]
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
        ]);


        return { tools };
    }

    /**
     * 处理工具调用请求
     */
    private static async handleToolsCall(ctx: RouterContext, session: MCPConnection, params: any) {
        const { name, arguments: args = {} } = ToolsCallParamsSchema.parse(params);

        try {
            let result: any;

            switch (name) {
                case "connect_game":
                    result = await this.handleConnectGame(ctx, session, { gameId: args.gameId });
                    break;
                case "disconnect_game":
                    result = await this.handleDisconnectGame(ctx, session);
                    break;
                case "get_game_status":
                    result = await this.handleGetGameStatus(ctx, session, {});
                    break;
                case "set_strength":
                    result = await this.handleSetStrength(ctx, session, { strength: args.strength });
                    break;
                case "increase_strength":
                    result = await this.handleIncreaseStrength(ctx, session, { amount: args.amount });
                    break;
                case "decrease_strength":
                    result = await this.handleDecreaseStrength(ctx, session, { amount: args.amount });
                    break;
                case "set_pulse":
                    result = await this.handleSetPulse(ctx, session, { pulseId: args.pulseId });
                    break;
                case "fire_action":
                    result = await this.handleFireAction(ctx, session, {
                        strength: args.strength,
                        duration: args.duration,
                        pulseId: args.pulseId
                    });
                    break;
                case "get_pulse_list":
                    result = await this.handleGetPulseList(ctx, session, {});
                    break;
                case "get_resources_list":
                    result = await this.handleResourcesList(ctx, session);
                    break;
                case "get_resource":
                    result = await this.handleResourcesRead(ctx, session, {
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

        if (gameId === 'all') {
            return { valid: true };
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
    private static async handleResourcesList(ctx: RouterContext, session: MCPConnection) {
        const resources = [
            {
                uri: `game://strength`,
                name: `当前电量状态`,
                description: "实时电量信息，包括当前强度、强度限制和随机强度范围",
                mimeType: "application/json"
            }
        ];

        return { resources };
    }

    /**
     * 处理资源读取请求
     */
    private static async handleResourcesRead(ctx: RouterContext, session: MCPConnection, params: any) {
        const { uri } = ResourcesReadParamsSchema.parse(params);

        if (uri === `game://strength`) {
            const validation = this.validateGame(session.gameId!);
            if (!validation.valid) {
                throw validation.error;
            }

            const game = validation.game;
            const strengthInfo = {
                gameId: session.gameId!,
                currentStrength: game?.strengthConfig?.strength || 0,
                strengthLimit: 200,
                randomStrength: game?.strengthConfig?.randomStrength || 0,
                isConnected: !!game?.client,
                isStarted: !!game?.running,
                lastUpdated: new Date().toISOString()
            };

            return {
                contents: [
                    {
                        uri,
                        mimeType: "application/json",
                        text: JSON.stringify(strengthInfo, null, 2)
                    }
                ]
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
    private static async handlePromptsList(ctx: RouterContext, session: MCPConnection, params: any) {
        return {
            prompts: []
        };
    }

    /**
     * 处理资源订阅请求
     */
    private static async handleResourcesSubscribe(ctx: RouterContext, session: MCPConnection, params: any) {
        const { uri } = z.object({
            uri: z.string().url()
        }).parse(params);

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
    private static async handleResourcesUnsubscribe(ctx: RouterContext, session: MCPConnection, params: any) {
        const { uri } = z.object({
            uri: z.string().url()
        }).parse(params);

        // 取消订阅资源
        session.unsubscribeResource(uri);

        return {
            success: true,
            message: `已取消订阅资源 ${uri}`
        };
    }

    /**
     * 获取强度状态的自然语言描述
     */
    private static getStrengthStatusMessage(game: CoyoteGameController, operation: string, oldStrength?: number, newStrength?: number): string {
        const current = newStrength ?? game.strengthConfig.strength ?? 0;
        const limit = game.clientStrength.limit ?? 20;
        const random = game.strengthConfig.randomStrength ?? 0;
        const started = game.running ? "已启动" : "未启动";

        let message = `${operation}成功。`;
        if (oldStrength !== undefined && newStrength !== undefined) {
            message += `强度从 ${oldStrength} 调整到 ${newStrength}。`;
        }
        message += `当前电量: ${current}/上限: ${limit}，随机电量范围: ±${random}，电击状态: ${started}。`;

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

    private static async handleConnectGame(ctx: RouterContext, session: MCPConnection, params: any) {
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

    private static async handleDisconnectGame(ctx: RouterContext, session: MCPConnection) {
        session.unbindGame();
        return {
            success: true
        };
    }

    /**
     * 获取游戏状态
     */
    private static async handleGetGameStatus(ctx: RouterContext, session: MCPConnection, params: any): Promise<GameStatus> {
        const validation = this.validateGame(session.gameId);
        if (!validation.valid) {
            throw validation.error;
        }

        const game = validation.game;
        const gameConfig = await GameModel.getByGameId(ctx.database, session.gameId!);

        const status: GameStatus = {
            gameId: session.gameId!,
            isStarted: game?.running || false,
            currentStrength: game?.strengthConfig.strength || 0,
            randomStrengthRange: game?.strengthConfig.randomStrength || 0,
            strengthLimit: game?.clientStrength.limit || 0,
            currentPulseId: Array.isArray(gameConfig?.pulseId) ? gameConfig.pulseId[0] : (gameConfig?.pulseId || 'default'),
            message: game ? this.getStrengthStatusMessage(game, "获取游戏状态") : '未连接到游戏（控制器）',
        };

        return status;
    }

    /**
     * 设置强度
     */
    private static async handleSetStrength(ctx: RouterContext, session: MCPConnection, params: any) {
        const validation = this.validateGame(session.gameId);
        if (!validation.valid) {
            throw validation.error;
        }

        let { strength } = SetStrengthParamsSchema.parse(params);

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

        const oldStrength = game.strengthConfig?.strength || 0;

        strength = Math.min(Math.max(strength, 0), game.clientStrength.limit); // 确保强度不超过限制

        // 设置强度
        game.updateStrengthConfig({
            strength: strength,
            randomStrength: game.strengthConfig.randomStrength,
        });

        // 发送资源更新通知
        await this.notifyResourceUpdate(session.gameId!);

        return {
            success: true,
            oldStrength,
            newStrength: strength,
            strengthLimit: 200,
            randomStrength: game.strengthConfig.randomStrength || 0,
            message: this.getStrengthStatusMessage(game, "设置电量", oldStrength, strength)
        };
    }

    /**
     * 增加强度
     */
    private static async handleIncreaseStrength(ctx: RouterContext, session: MCPConnection, params: any) {
        const validation = this.validateGame(session.gameId!);
        if (!validation.valid) {
            throw validation.error;
        }

        const { amount } = IncreaseStrengthParamsSchema.parse(params);

        const game = CoyoteGameManager.instance.getGame(session.gameId!);
        if (!game) {
            throw {
                code: MCP_ERROR_CODES.GAME_NOT_FOUND,
                message: `游戏 ${session.gameId} 不存在`
            };
        }

        const oldStrength = game.strengthConfig?.strength || 0;
        const strength = Math.min(Math.max(oldStrength + amount, 0), game.clientStrength.limit); // 确保强度不超过限制

        // 设置强度
        game.updateStrengthConfig({
            strength: strength,
            randomStrength: game.strengthConfig.randomStrength,
        });

        // 发送资源更新通知
        await this.notifyResourceUpdate(session.gameId!);

        return {
            success: true,
            oldStrength,
            newStrength: strength,
            strengthLimit: 200,
            randomStrength: game.strengthConfig.randomStrength || 0,
            message: this.getStrengthStatusMessage(game, "增加电量", oldStrength, strength)
        };
    }

    /**
     * 减少强度
     */
    private static async handleDecreaseStrength(ctx: RouterContext, session: MCPConnection, params: any) {
        const validation = this.validateGame(session.gameId!);
        if (!validation.valid) {
            throw validation.error;
        }

        const { amount } = DecreaseStrengthParamsSchema.parse(params);

        const game = CoyoteGameManager.instance.getGame(session.gameId!);
        if (!game) {
            throw {
                code: MCP_ERROR_CODES.GAME_NOT_FOUND,
                message: `游戏 ${session.gameId} 不存在`
            };
        }

        const oldStrength = game.strengthConfig?.strength || 0;
        const strength = Math.min(Math.max(oldStrength - amount, 0), game.clientStrength.limit); // 确保强度不超过限制

        // 设置强度
        game.updateStrengthConfig({
            strength: strength,
            randomStrength: game.strengthConfig.randomStrength,
        });

        // 发送资源更新通知
        await this.notifyResourceUpdate(session.gameId!);

        return {
            success: true,
            oldStrength,
            newStrength: strength,
            strengthLimit: 200,
            randomStrength: game.strengthConfig.randomStrength || 0,
            message: this.getStrengthStatusMessage(game, "减少电量", oldStrength, strength)
        };
    }

    /**
     * 设置波形
     */
    private static async handleSetPulse(ctx: RouterContext, session: MCPConnection, params: any) {
        const validation = this.validateGame(session.gameId!);
        if (!validation.valid) {
            throw validation.error;
        }

        const { pulseId } = SetPulseParamsSchema.parse(params);

        // 验证波形是否存在
        const pulseList = DGLabPulseService.instance.pulseList;
        const pulseExists = pulseList.some((pulse: any) => pulse.id === pulseId);

        if (!pulseExists) {
            throw {
                code: MCP_ERROR_CODES.INVALID_PULSE_ID,
                message: `波形 ${pulseId} 不存在`
            };
        }

        // 更新游戏配置
        await GameModel.update(ctx.database, session.gameId!, {
            pulseId: pulseId
        });

        return {
            success: true,
            newPulseId: pulseId
        };
    }

    /**
     * 开火动作
     */
    private static async handleFireAction(ctx: RouterContext, session: MCPConnection, params: any) {
        const validation = this.validateGame(session.gameId!);
        if (!validation.valid) {
            throw validation.error;
        }

        const { strength, duration = 5000, pulseId } = FireActionParamsSchema.parse(params);

        const game = validation.game;
        if (!game) {
            throw {
                code: MCP_ERROR_CODES.GAME_NOT_CONNECTED,
                message: `游戏 ${session.gameId} 未连接`
            };
        }

        // 生成开火 ID
        const fireActionId = `fire_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            // 创建开火动作
            const { GameFireAction } = await import('#app/controllers/game/actions/GameFireAction.js');

            const fireAction = new GameFireAction({
                strength,
                time: duration,
                pulseId: pulseId,
                updateMode: 'append',
            });

            await game.startAction(fireAction);

            // 发送资源更新通知
            await this.notifyResourceUpdate(session.gameId!);

            return {
                success: true,
                fireActionId,
                actualDuration: duration,
                message: `开火动作已启动！强度: ${strength}，持续时间: ${duration}ms。${this.getStrengthStatusMessage(game, "开火动作")}`
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
    private static async handleGetPulseList(ctx: RouterContext, session: MCPConnection, params: any) {
        const pulseList = DGLabPulseService.instance.pulseList;

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
    public async mcpApiSSEHandler(ctx: RouterContext): Promise<void> {
        console.log('MCP API 连接:', ctx.header, ctx.params, ctx.query);
        const connectionId = uuid();

        // 获取或设置会话ID
        const sessionId = firstHeader(ctx.req.headers['mcp-session-id']) ?? uuid();

        // 设置SSE响应头
        ctx.set({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control',
            'Mcp-Session-Id': sessionId,
        });

        // 创建PassThrough流
        const stream = new PassThrough();
        ctx.body = stream;

        // 添加连接到管理器
        const session = MCPApiController.addSSEConnection(connectionId, sessionId, stream);

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
            MCPApiController.removeSSEConnection(connectionId);
        });

        ctx.req.on('error', () => {
            clearInterval(heartbeat);
            MCPApiController.removeSSEConnection(connectionId);
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
    public async mcpApiSSEWithGameIdHandler(ctx: RouterContext): Promise<void> {
        await this.mcpApiSSEHandler(ctx);
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
    @body(MCPRequestSchema)
    @responses(MCPResponseSchema)
    public async mcpHandler(ctx: RouterContext): Promise<void> {
        // console.log('MCP API 请求:', ctx.method, ctx.path, ctx.params, ctx.query, ctx.request.body);
        const sessionId = ctx.query.session_id as string;

        const session = MCPApiController.mcpConnections.get(sessionId);
        if (!session) {
            ctx.body = MCPApiController.createErrorResponse(
                null,
                MCP_ERROR_CODES.SESSION_NOT_FOUND,
                `会话 ${sessionId} 不存在或已过期`
            );
            ctx.status = 404;
            return;
        }

        let requestBody: MCPRequest;
        try {
            requestBody = MCPRequestSchema.parse(ctx.request.body);
        } catch (error: any) {
            ctx.body = MCPApiController.createErrorResponse(
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
                    result = await MCPApiController.handleInitialize(ctx, params);
                    break;

                case MCP_METHODS.PING:
                    result = {}
                    break;

                case MCP_METHODS.TOOLS_LIST:
                    result = await MCPApiController.handleToolsList(ctx, !!session.gameId);
                    break;

                case MCP_METHODS.TOOLS_CALL:
                    result = await MCPApiController.handleToolsCall(ctx, session, params);
                    break;

                case MCP_METHODS.RESOURCES_LIST:
                    result = await MCPApiController.handleResourcesList(ctx, session);
                    break;

                case MCP_METHODS.RESOURCES_READ:
                    result = await MCPApiController.handleResourcesRead(ctx, session, params);
                    break;

                case MCP_METHODS.RESOURCES_SUBSCRIBE:
                    result = await MCPApiController.handleResourcesSubscribe(ctx, session, params);
                    break;

                case MCP_METHODS.RESOURCES_UNSUBSCRIBE:
                    result = await MCPApiController.handleResourcesUnsubscribe(ctx, session, params);
                    break;

                case MCP_METHODS.PROMPTS_LIST:
                    result = await MCPApiController.handlePromptsList(ctx, session, params);
                    break;

                default:

                    ctx.body = MCPApiController.createErrorResponse(
                        id,
                        MCP_ERROR_CODES.METHOD_NOT_FOUND,
                        `方法 '${method}' 不存在`
                    );
                    ctx.status = 404;
                    return;
            }

            session.sendEvent({
                event: 'message',
                data: MCPApiController.createSuccessResponse(id, result)
            });

            ctx.body = '';
            ctx.status = 202; // 202 Accepted

        } catch (error: any) {
            if (error.code && error.message) {
                // 这是我们的自定义错误
                ctx.body = MCPApiController.createErrorResponse(id, error.code, error.message, error.data);
            } else {
                // 未知错误
                ctx.body = MCPApiController.createErrorResponse(
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
