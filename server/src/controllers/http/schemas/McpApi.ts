import { z } from "koa-swagger-decorator";
import { ClientIdSchema } from "./GameApi.js";

/**
 * MCP (Model Context Protocol) API Schemas
 */

// MCP 基础响应格式
export const McpResponseSchema = z.object({
    jsonrpc: z.literal("2.0").describe("JSON-RPC 版本"),
    id: z.union([z.string(), z.number(), z.null()]).describe("请求 ID"),
    result: z.any().optional().describe("成功响应结果"),
    error: z.object({
        code: z.number().describe("错误代码"),
        message: z.string().describe("错误消息"),
        data: z.any().optional().describe("额外错误数据")
    }).optional().describe("错误信息")
}).describe("MCP 响应格式");

export type McpResponse = z.infer<typeof McpResponseSchema>;

// MCP 请求格式
export const McpRequestSchema = z.object({
    jsonrpc: z.literal("2.0").describe("JSON-RPC 版本"),
    id: z.union([z.string(), z.number(), z.null()]).optional().describe("请求 ID"),
    method: z.string().describe("方法名称"),
    params: z.any().optional().describe("方法参数")
}).describe("MCP 请求格式");

export type McpRequest = z.infer<typeof McpRequestSchema>;

// MCP 初始化相关 schemas
export const InitializeRequestParamsSchema = z.object({
    protocolVersion: z.string().describe("协议版本"),
    capabilities: z.object({
        roots: z.object({
            listChanged: z.boolean().optional()
        }).optional().describe("文件系统根目录能力"),
        sampling: z.object({}).optional().describe("LLM采样能力"),
        elicitation: z.object({}).optional().describe("信息获取能力"),
        experimental: z.record(z.any()).optional().describe("实验性功能")
    }).describe("客户端能力"),
    clientInfo: z.object({
        name: z.string().describe("客户端名称"),
        title: z.string().optional().describe("客户端显示名称"),
        version: z.string().describe("客户端版本")
    }).describe("客户端信息")
}).describe("初始化请求参数");

export const InitializeResultSchema = z.object({
    protocolVersion: z.string().describe("协议版本"),
    capabilities: z.object({
        logging: z.object({}).optional().describe("日志能力"),
        prompts: z.object({
            listChanged: z.boolean().optional()
        }).optional().describe("提示模板能力"),
        resources: z.object({
            subscribe: z.boolean().optional(),
            listChanged: z.boolean().optional()
        }).optional().describe("资源能力"),
        tools: z.object({
            listChanged: z.boolean().optional()
        }).optional().describe("工具能力"),
        completions: z.object({}).optional().describe("自动完成能力"),
        experimental: z.record(z.any()).optional().describe("实验性功能")
    }).describe("服务器能力"),
    serverInfo: z.object({
        name: z.string().describe("服务器名称"),
        title: z.string().optional().describe("服务器显示名称"),
        version: z.string().describe("服务器版本")
    }).describe("服务器信息"),
    instructions: z.string().optional().describe("给客户端的指令")
}).describe("初始化响应结果");

// MCP 工具相关 schemas
export const ToolSchema = z.object({
    name: z.string().describe("工具名称"),
    description: z.string().describe("工具描述"),
    inputSchema: z.object({
        type: z.literal("object"),
        properties: z.record(z.any()).optional(),
        required: z.array(z.string()).optional()
    }).describe("输入参数schema")
}).describe("工具定义");
export type Tool = z.infer<typeof ToolSchema>;

export const ToolsListResultSchema = z.object({
    tools: z.array(ToolSchema).describe("工具列表")
}).describe("工具列表结果");

export const ToolsCallParamsSchema = z.object({
    name: z.string().describe("工具名称"),
    arguments: z.record(z.any()).optional().describe("工具参数")
}).describe("工具调用参数");

export const ToolsCallResultSchema = z.object({
    content: z.array(z.object({
        type: z.enum(["text", "image", "resource"]).describe("内容类型"),
        text: z.string().optional().describe("文本内容"),
        data: z.string().optional().describe("base64编码的数据"),
        mimeType: z.string().optional().describe("MIME类型")
    })).describe("工具执行结果内容"),
    isError: z.boolean().optional().describe("是否为错误")
}).describe("工具调用结果");

// 游戏状态信息
export const GameStatusSchema = z.object({
    gameId: z.string().describe("游戏 ID"),
    isStarted: z.boolean().describe("电击是否已启动"),
    currentStrength: z.number().int().min(0).max(200).describe("当前电击强度"),
    randomStrengthRange: z.number().int().min(0).max(200).describe("随机电击强度范围"),
    strengthLimit: z.number().int().min(0).max(200).describe("电击强度限制"),
    currentPulseId: z.string().optional().describe("当前波形 ID"),
    message: z.string().optional().describe("状态消息"),
}).describe("游戏状态信息");

export type GameStatus = z.infer<typeof GameStatusSchema>;

// MCP 方法参数 schemas
export const GetGameStatusParamsSchema = z.object({}).describe("获取游戏状态参数");

export const SetStrengthParamsSchema = z.object({
    strength: z.number().int().min(0).max(200).describe("设置的电击强度值")
}).describe("设置电击强度参数");

export const SetPulseParamsSchema = z.object({
    pulseId: z.string().describe("波形 ID")
}).describe("设置波形参数");

export const FireActionParamsSchema = z.object({
    strength: z.number().int().min(0).max(200).describe("一键开火强度"),
    duration: z.number().int().min(100).max(30000).optional().default(5000).describe("持续时间（毫秒）"),
    pulseId: z.string().optional().describe("指定波形 ID")
}).describe("一键开火动作参数");

// MCP 方法结果 schemas
export const GetGameStatusResultSchema = GameStatusSchema.describe("游戏状态结果");

export const SetStrengthResultSchema = z.object({
    success: z.boolean().describe("操作是否成功"),
    newStrength: z.number().int().min(0).max(200).describe("新的电击强度值")
}).describe("设置电击强度结果");

export const SetPulseResultSchema = z.object({
    success: z.boolean().describe("操作是否成功"),
    newPulseId: z.string().describe("新的波形 ID")
}).describe("设置波形结果");

export const FireActionResultSchema = z.object({
    success: z.boolean().describe("操作是否成功"),
    fireActionId: z.string().describe("一键开火动作 ID"),
    actualDuration: z.number().int().describe("实际持续时间")
}).describe("开火动作结果");

export const GetPulseListResultSchema = z.object({
    pulses: z.array(z.object({
        id: z.string().describe("波形 ID"),
        name: z.string().describe("波形名称")
    })).describe("波形列表")
}).describe("获取波形列表结果");

// MCP 资源相关 schemas
export const ResourceSchema = z.object({
    uri: z.string().describe("资源URI"),
    name: z.string().describe("资源名称"),
    description: z.string().optional().describe("资源描述"),
    mimeType: z.string().optional().describe("MIME类型")
}).describe("资源定义");

export const ResourcesListResultSchema = z.object({
    resources: z.array(ResourceSchema).describe("资源列表")
}).describe("资源列表结果");

export const ResourcesReadParamsSchema = z.object({
    uri: z.string().describe("资源URI")
}).describe("资源读取参数");

export const ResourcesReadResultSchema = z.object({
    contents: z.array(z.object({
        uri: z.string().describe("资源URI"),
        mimeType: z.string().optional().describe("MIME类型"),
        text: z.string().optional().describe("文本内容"),
        blob: z.string().optional().describe("二进制内容(base64编码)")
    })).describe("资源内容")
}).describe("资源读取结果");

export const IncreaseStrengthParamsSchema = z.object({
    amount: z.number().int().min(1).max(200).describe("增加的电击强度值")
}).describe("增强电击强度参数");

export const DecreaseStrengthParamsSchema = z.object({
    amount: z.number().int().min(1).max(200).describe("减少的电击强度值")
}).describe("减少电击强度参数");

export const StrengthOperationResultSchema = z.object({
    success: z.boolean().describe("操作是否成功"),
    oldStrength: z.number().int().min(0).max(200).describe("操作前电击强度"),
    newStrength: z.number().int().min(0).max(200).describe("操作后电击强度"),
    strengthLimit: z.number().int().min(0).max(200).describe("电击强度限制"),
    randomStrength: z.number().int().min(0).max(200).describe("随机电击强度范围"),
    message: z.string().describe("操作结果说明")
}).describe("电击强度操作结果");

// MCP 错误代码常量
export const MCP_ERROR_CODES = {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
    GAME_NOT_FOUND: -32001,
    GAME_NOT_CONNECTED: -32002,
    INVALID_STRENGTH: -32003,
    INVALID_PULSE_ID: -32004,
    OPERATION_FAILED: -32005,
    SESSION_NOT_FOUND: -32005,
} as const;

// MCP 支持的方法列表
export const MCP_METHODS = {
    // 标准 MCP 方法
    INITIALIZE: 'initialize',
    PING: 'ping',
    TOOLS_LIST: 'tools/list',
    TOOLS_CALL: 'tools/call',
    RESOURCES_LIST: 'resources/list', 
    RESOURCES_READ: 'resources/read',
    RESOURCES_SUBSCRIBE: 'resources/subscribe',
    RESOURCES_UNSUBSCRIBE: 'resources/unsubscribe',
    PROMPTS_LIST: 'prompts/list',
    PROMPTS_GET: 'prompts/get',
} as const;

export const ListMethodsResultSchema = z.object({
    methods: z.array(z.object({
        name: z.string().describe("方法名称"),
        description: z.string().describe("方法描述"),
        params: z.any().describe("参数 schema"),
        result: z.any().describe("结果 schema")
    })).describe("支持的方法列表")
}).describe("方法列表结果");

export const GameEventSchema = z.object({
    type: z.enum(["strength_changed", "pulse_changed", "connection_changed", "fire_action"]).describe("游戏事件类型"),
    gameId: z.string().describe("游戏ID"),
    data: z.any().describe("事件数据"),
    timestamp: z.string().describe("事件时间戳")
}).describe("游戏事件");
