import { dial } from "deno";
import { Connection, ConnectionParams } from "./connection.ts";


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
        this.connection = new Connection(conn, conn);

        await this.connection.startup({ ...this.connectionParams });
    }

    async query(text: string) {
        return await this.connection.query(text);
    }

    async end() {
        // TODO: this method is not finished, close "conn" from `connect` is not closed properly
        await this.connection.end();
    }
}