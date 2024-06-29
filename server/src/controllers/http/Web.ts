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
            message: 'Welcome to DG-Lab Live Game Server',
        };
    }

    public static async getServerInfo(ctx: Context): Promise<void> {
        const config = MainConfig.value;

        let wsUrl = '';
        if (config.wsDomain) {
            wsUrl = `${config.wsDomain}:${config.port}/ws`;
        } else {
            wsUrl = '/ws';
        }

        let wsDomainList: string[] = [];
        if (config.wsDomain) {
            wsDomainList.push(config.wsDomain);
        } else {
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
                message: 'Failed to create unique client ID',
            };
            return;
        }

        ctx.body = {
            status: 1,
            clientId,
        };
    }
}