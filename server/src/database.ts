import { DataSource, DataSourceOptions } from "typeorm";
import { ModelList } from "./models/index.js";
import { MainConfigType, MysqlConfigSchema, MysqlConfigType, PostgresqlConfigSchema, SqliteConfigSchema } from "./types/config.js";

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
        dataSource = new DataSource({
            type: 'sqlite',
            database: sqliteConfig.file || 'data/database.sqlite',
            ...schemaOpts,
        });
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