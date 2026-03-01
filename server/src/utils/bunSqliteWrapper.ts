import { Database, DatabaseOptions } from "bun:sqlite";

export type PatchedDatabase = Database & {
    pragma: (command: string, options?: { simple?: boolean }) => unknown;
};

const READ_QUERY_REGEX = /^\s*(select|pragma|with|explain)\b/i;

function isReaderStatement(sql: string): boolean {
    return READ_QUERY_REGEX.test(sql);
}

function createPrepareFunction(db: Database) {
    const originalPrepare = db.prepare.bind(db);

    return (source: string) => {
        const stmt = originalPrepare(source) as unknown as Record<string, unknown>;

        if (typeof source === "string" && stmt.reader === undefined) {
            Object.defineProperty(stmt, "reader", {
                value: isReaderStatement(source),
                configurable: true,
                writable: false,
                enumerable: false,
            });
        }

        return stmt;
    };
}

function createPragmaFunction(db: Database) {
    return (source: string, options: { simple?: boolean } = {}) => {
        if (typeof source !== "string") throw new TypeError("Expected first argument to be a string");
        if (typeof options !== "object") throw new TypeError("Expected second argument to be an options object");
        const simple = !!options.simple;

        const stmt = db.prepare(`PRAGMA ${source}`);
        if (simple) {
            const result = stmt.get() as Record<string, unknown> | null;
            if (!result) return undefined;
            const key = Object.keys(result)[0];
            return key ? result[key] : undefined;
        }
        return stmt.all();
    };
}

export function createBunSqliteConnection(filePath: string, options?: number | Record<string, any>): Database {
    options = typeof options === "number" ? { mode: options } : options || {};

    const bunSqliteOpts: DatabaseOptions = {
        readonly: !!options.readonly,
        create: options.fileMustExist ? false : true,
    };

    const db = new Database(filePath, bunSqliteOpts) as PatchedDatabase;
    Object.defineProperty(db, "prepare", {
        value: createPrepareFunction(db),
        configurable: true,
        writable: false,
    });
    Object.defineProperty(db, "pragma", {
        value: createPragmaFunction(db),
        configurable: true,
        writable: false,
    });

    return db;
}