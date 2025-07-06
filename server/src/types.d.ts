import 'koa';
import 'http';
import { DataSource } from 'typeorm';
import { ServerContext } from './types/server.js';

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

declare module 'koa' {
    interface ExtendableContext extends ServerContext {
    }
}