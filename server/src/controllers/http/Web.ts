import { v4 as uuidv4 } from 'uuid';
import Koa, { Context } from 'koa';
import { responses, routeConfig } from 'koa-swagger-decorator';
import { DGLabWSManager } from '../../managers/DGLabWSManager.js';
import { MainConfig } from '../../config.js';
import { LocalIPAddress } from '../../utils/utils.js';
import { CustomSkinService } from '../../services/CustomSkinService.js';
import { GetClientConnectInfoResponse, GetClientConnectInfoResponseSchema, GetCustomSkinListResponse, GetCustomSkinListResponseSchema, ServerInfoResponse, ServerInfoResponseSchema, WebApiResponseSchema } from './schemas/Web.js';

const DGLAB_WS_PREFIX = 'https://www.dungeon-lab.com/app-download.php#DGLAB-SOCKET#';

export class WebController {
    @routeConfig({
        method: 'get',
        path: '/',
        summary: '当没有前端资源时显示的欢迎页面',
        operationId: 'Fallback Index',
        tags: ['Web'],
    })
    @responses(WebApiResponseSchema)
    public async index(ctx: Koa.ParameterizedContext): Promise<void> {
        ctx.body = {
            status: 1,
            code: 'OK',
            message: 'Welcome to DG-Lab Live Game Server',
        };
    }

    @routeConfig({
        method: 'get',
        path: '/api/server_info',
        summary: '获取服务器信息',
        operationId: 'Get Server Info',
        tags: ['Web'],
    })
    @responses(ServerInfoResponseSchema)
    public async getServerInfo(ctx: Context): Promise<void> {
        const config = MainConfig.value;

        let wsUrl = '';
        if (config.webWsBaseUrl) {
            wsUrl = `${config.webWsBaseUrl}/ws/`;
        } else {
            wsUrl = '/ws/';
        }

        let clientWsDomain = config.clientWsBaseUrl || config.webWsBaseUrl;
        let wsUrlList: Record<string, string>[] = [];
        if (clientWsDomain) { // 配置文件中指定了客户端连接时的WebSocket地址
            let url = new URL(clientWsDomain);
            let domain = url.hostname;
            wsUrlList.push({
                domain,
                connectUrl: `${DGLAB_WS_PREFIX}${clientWsDomain}/dglab_ws/{clientId}`,
            });
        } else { // 未指定客户端连接时的WebSocket地址，使用本机IP地址
            let ipList = LocalIPAddress.getIPAddrList();

            wsUrlList = ipList.map((ip) => {
                return {
                    domain: ip,
                    connectUrl: `${DGLAB_WS_PREFIX}ws://${ip}:${config.port}/dglab_ws/{clientId}`,
                };
            });
        }

        const apiBaseHttpUrl = config.apiBaseHttpUrl ?? config.webBaseUrl ?? `http://127.0.0.1:${config.port}`;

        ctx.body = {
            status: 1,
            code: 'OK',
            server: {
                wsUrl: wsUrl,
                clientWsUrls: wsUrlList,
                apiBaseHttpUrl,
            },
        } as ServerInfoResponse;
    };

    @routeConfig({
        method: 'get',
        path: '/api/custom_skins',
        summary: '获取自定义皮肤列表',
        operationId: 'Get Custom Skin List',
        tags: ['Web'],
    })
    @responses(GetCustomSkinListResponseSchema)
    public async getCustomSkinList(ctx: Context): Promise<void> {
        ctx.body = {
            status: 1,
            code: 'OK',
            customSkins: CustomSkinService.instance.skins,
        } as GetCustomSkinListResponse;
    }

    @routeConfig({
        method: 'get',
        path: '/api/client/connect',
        summary: '获取客户端连接信息',
        operationId: 'Get Client Connect Info',
        tags: ['Web'],
    })
    @responses(GetClientConnectInfoResponseSchema)
    public async getClientConnectInfo(ctx: Context): Promise<void> {
        let clientId: string = '';
        for (let i = 0; i < 10; i++) {
            clientId = uuidv4();
            if (!DGLabWSManager.instance.getClient(clientId)) {
                break;
            } else {
                clientId = '';
            }
        }

        if (clientId === '') {
            ctx.body = {
                status: 0,
                code: 'ERR::CREATE_CLIENT_ID_FAILED',
                message: '无法创建唯一的客户端ID，请稍后重试',
            };
            return;
        }

        ctx.body = {
            status: 1,
            code: 'OK',
            clientId,
        } as GetClientConnectInfoResponse;
    }

    public async notImplemented(ctx: Context): Promise<void> {
        ctx.body = {
            status: 0,
            code: 'ERR::NOT_IMPLEMENTED',
            message: '此功能尚未实现',
        };
    }
}