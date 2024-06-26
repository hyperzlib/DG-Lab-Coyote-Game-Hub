import { IncomingMessage } from 'http';
import WebSocket from 'ws';
import { pathToRegexp } from 'path-to-regexp';

export type WebSocketRouterCallback = (ws: WebSocket, req: IncomingMessage, routeParams: Record<string, string>) => void;

export type WebSocketRouteInfo = {
    url: string;
    regexp: RegExp & { keys: { name: string }[] };
    callback: WebSocketRouterCallback;
};

export type WebSocketRouteMatchResult = {
    route: WebSocketRouteInfo;
    params: Record<string, string>;
};

export class WebSocketRouter {
    public routes: WebSocketRouteInfo[]; // 保存路由信息

    constructor() {
        this.routes = [];
    }

    public get(url: string, callback: WebSocketRouterCallback) {
        const regexp = pathToRegexp(url);
        this.routes.push({
            url,
            regexp,
            callback
        });
    }

    public match(url: string): WebSocketRouteMatchResult | null {
        for (const route of this.routes) {
            if (route.regexp.test(url)) {
                // 提取路由参数
                let routeParams: Record<string, string> = {};
                const keys = route.regexp.keys;
                const matches = route.regexp.exec(url);
                if (matches) {
                    for (let i = 1; i < matches.length; i++) {
                        routeParams[keys[i - 1].name] = matches[i];
                    }
                }

                return {
                    route,
                    params: routeParams
                };
            }
        }

        return null;
    }
}