import { dial } from "deno";
import { Connection, ConnectionParams } from "./connection.ts";
import { Query, QueryConfig, QueryResult } from "./query.ts";


// TODO: refactor this to properly use
//  default values, read from env variables as well
const DEFAULT_CONNECTION_PARAMS = {
    database: "postgres",
    host: "127.0.0.1",
    port: 5432,
    user: "postgres",
    password: "postgres",
    application_name: "deno_postgres"
};

export class Client {
    connection: Connection;
    connectionParams: ConnectionParams;

    constructor(connectionParams?: ConnectionParams) {
        if (connectionParams) {
            this.connectionParams = {
                ...DEFAULT_CONNECTION_PARAMS,
                ...connectionParams,
            };
        } else {
            this.connectionParams = {
                ...DEFAULT_CONNECTION_PARAMS,
            };
        }
    }

    async connect() {
        const { host, port } = this.connectionParams;
        let addr = `${host}:${port}`;

        const conn = await dial("tcp", addr);
        this.connection = new Connection(conn);

        await this.connection.startup({ ...this.connectionParams });
    }

    // TODO: can we use more specific type for args?
    async query(text: string | QueryConfig, ...args: any[]): Promise<QueryResult> {
        let config: QueryConfig;

        if (typeof(text) === "string") {
            config = { text, args }
        } else {
            config = text;
        }
        const query = new Query(this.connection, config);

        return await query.execute();
    }

    async end(): Promise<void> {
        await this.connection.end();
    }
}