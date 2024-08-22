import { ChartParamDef } from './types/ChartParamDef';

declare module 'vue-router' {
    interface RouteMeta {
        params: ChartParamDef[];
    }
}