import { v4 as uuidv4 } from 'uuid';
import { Context } from 'koa';
import { DGLabWSManager } from '../../managers/DGLabWSManager';
import { MainConfig } from '../../config';
import { LocalIPAddress } from '../../utils/utils';

const DGLAB_WS_PREFIX = 'https://www.dungeon-lab.com/app-download.php#DGLAB-SOCKET#';

export class WebController {
    public static async index(ctx: Context): Promise<void> {
        ctx.body = {
            status: 1,
            code: 'OK',
            message: 'Welcome to DG-Lab Live Game Server',
        };
    }

    public static async getServerInfo(ctx: Context): Promise<void> {
        const config = MainConfig.value;

        let wsUrl = '';
        if (config.domain) {
            wsUrl = `${config.domain}:${config.port}/ws`;
        } else {
            wsUrl = '/ws';
        }

        let wsDomainList: string[] = [];
        let clientWsDomain = config.clientWsDomain || config.domain || null;
        if (clientWsDomain) { // 配置文件中指定了客户端连接时的WebSocket地址
            wsDomainList.push(clientWsDomain);
        } else { // 使用服务器的IP地址
            wsDomainList = LocalIPAddress.getIPAddrList();
        }

        let protocol = config.proxySSLEnable ? 'wss' : 'ws';

        let wsUrlList: Record<string, string>[] = wsDomainList.map((domain) => {
            return {
                domain: domain,
                connectUrl: `${DGLAB_WS_PREFIX}${protocol}://${domain}:${config.port}/dglab_ws/{clientId}`,
            };
        });

        ctx.body = {
            status: 1,
            code: 'OK',
            server: {
                wsUrl: wsUrl,
                clientWsUrls: wsUrlList,
            },
        };
    };

    public static async getClientConnectInfo(ctx: Context): Promise<void> {
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
        };
    }
}