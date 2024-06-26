import { v4 as uuidv4 } from 'uuid';
import { Context } from 'koa';
import { DGLabWSManager } from '../../managers/DGLabWSManager';
import { MainConfig } from '../../config';
import { LocalIPAddress } from '../../utils/utils';

const DGLAB_WS_PREFIX = 'https://www.dungeon-lab.com/app-download.php#DGLAB-SOCKET#';

export class WebController {
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

        let wsDomainList: string[] = [];
        const config = MainConfig.value;
        if (config.wsDomain) {
            wsDomainList.push(config.wsDomain);
        } else {
            wsDomainList = LocalIPAddress.getIPAddrList();
        }

        let protocol = config.proxySSLEnable ? 'wss' : 'ws';

        let wsUrlList: string[] = wsDomainList.map((domain) => {
            return `${DGLAB_WS_PREFIX}${protocol}://${domain}:${config.port}/dglab_ws/${clientId}`;
        });

        ctx.body = {
            status: 1,
            clientId,
            wsUrls: wsUrlList,
        };
    }
}