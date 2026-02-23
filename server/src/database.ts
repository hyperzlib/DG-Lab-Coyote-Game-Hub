import { DataSource, DataSourceOptions } from "typeorm";
import { ModelList } from "./models/index.js";
import type { MainConfigType} from "./types/config.js";
import { MysqlConfigSchema, MysqlConfigType, PostgresqlConfigSchema, SqliteConfigSchema } from "./types/config.js";

export const createDatabaseConnection = async (config: MainConfigType): Promise<DataSource> => {
    const { databaseType, databaseConfig } = config;

    let dataSource: DataSource;

    let schemaOpts = {
        entities: ModelList,
        synchronize: true,
        logging: true,
    };

    if (databaseType === 'mysql') {
        const mysqlConfig = MysqlConfigSchema.parse(databaseConfig);
        dataSource = new DataSource({
            type: 'mysql',
            host: mysqlConfig.host,
            port: mysqlConfig.port,
            username: mysqlConfig.username,
            password: mysqlConfig.password,
            database: mysqlConfig.database,
            ...schemaOpts,
        });
    } else if (databaseType === 'sqlite') {
        const sqliteConfig = SqliteConfigSchema.parse(databaseConfig);
        // 检测是否是 Bun.js 环境，如果是则使用 Bun 内置的 SQLite 模块
        if (process.versions.bun) {
            const sqlite = await import('bun:sqlite');
            dataSource = new DataSource({
                type: 'better-sqlite3',
                database: sqliteConfig.file || 'data/database.sqlite',
                driver: sqlite,
                ...schemaOpts,
            });
        } else {
            dataSource = new DataSource({
                type: 'sqlite',
                database: sqliteConfig.file || 'data/database.sqlite',
                ...schemaOpts,
            });
        }
    } else if (databaseType === 'postgres') {
        const postgresConfig = PostgresqlConfigSchema.parse(databaseConfig);
        dataSource = new DataSource({
            type: 'postgres',
            host: postgresConfig.host,
            port: postgresConfig.port,
            username: postgresConfig.username,
            password: postgresConfig.password,
            database: postgresConfig.database,
            ...schemaOpts,
        });
    } else {
        throw new Error(`Unsupported database type: ${databaseType}`);
    }

    await dataSource.initialize();

    return dataSource;
}