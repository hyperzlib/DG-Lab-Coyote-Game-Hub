import 'koa';
import 'http';
import type { DataSource } from 'typeorm';
import { ServerContext } from './types/server.js';

/// <reference types="@types/bun" />

declare module "*.json"; // Allow importing JSON files

declare module 'koa' {
    interface Request {
        body?: any;
        rawBody: string;
    }
    
    interface DefaultContext {
        database: DataSource;
    }

    interface ExtendableContext {
        database: DataSource;
    }
}
declare module 'http' {
    interface IncomingMessage {
        body?: any;
        rawBody: string;
    }
}