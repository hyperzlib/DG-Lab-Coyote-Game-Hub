import 'koa';
import 'http';

declare module "*.json"; // Allow importing JSON files

declare module 'koa' {
    interface Request {
        body?: any;
        rawBody: string;
    }
}
declare module 'http' {
    interface IncomingMessage {
        body?: any;
        rawBody: string;
    }
}