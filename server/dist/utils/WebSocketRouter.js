import { pathToRegexp } from 'path-to-regexp';
export class WebSocketRouter {
    routes; // 保存路由信息
    constructor() {
        this.routes = [];
    }
    get(url, callback) {
        const regexp = pathToRegexp(url);
        this.routes.push({
            url,
            regexp,
            callback
        });
    }
    match(url) {
        for (const route of this.routes) {
            if (route.regexp.test(url)) {
                // 提取路由参数
                let routeParams = {};
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
