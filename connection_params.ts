import { env } from "deno";
import { parseDsn } from "./utils.ts";

const DEFAULT_CONNECTION_PARAMS = {
    host: "127.0.0.1",
    port: "5432",
    user: "postgres",
    database: "postgres",
    password: "",
    application_name: "deno_postgres"
};

export interface IConnectionParams {
    database?: string;
    host?: string;
    port?: string;
    user?: string;
    password?: string;
    application_name?: string;
}

export class ConnectionParams {
    database?: string;
    host?: string;
    port?: string;
    user?: string;
    password?: string;
    application_name?: string;
    // TODO: support other params

    constructor(config?: string | IConnectionParams) {
        const envVars = env();

        if (!config) {
            config = {};
        }
        
        if (typeof config === "string") {
            const dsn = parseDsn(config);
            if (dsn.driver !== "postgres") {
                throw new Error(`Supplied DSN has invalid driver: ${dsn.driver}.`);
            }

            this.database = dsn.database || envVars.PGDATABASE;
            this.host = dsn.host || envVars.PGHOST;
            this.port = dsn.port || envVars.PGPORT;
            this.user = dsn.user || envVars.PGUSER;
            this.password = dsn.password || envVars.PGPASSWORD;
            this.application_name = dsn.params.application_name || envVars.PGAPPNAME;
        } else {
            this.database = config.database || envVars.PGDATABASE;
            this.host = config.host || envVars.PGHOST;
            this.port = config.port || envVars.PGPORT;
            this.user = config.user || envVars.PGUSER;
            this.password = config.password || envVars.PGPASSWORD;
            this.application_name = config.application_name || envVars.PGAPPNAME;
        }
    }
}