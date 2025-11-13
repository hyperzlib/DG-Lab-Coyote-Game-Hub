import { IncomingMessage, ServerResponse } from 'http';

export type EngineRequest = IncomingMessage & {
    _query: Record<string, string>;
    res?: ServerResponse;
    cleanup?: Function;
    websocket?: any;
};