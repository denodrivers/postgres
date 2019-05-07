import { parseDsn } from "./utils.ts";


// this is dummy env object, if program
// was run with --allow-env permission then 
// it's filled with actual values
let pgEnv: IConnectionParams = {};

if (Deno.permissions().env) {
  const env = Deno.env();
  
  pgEnv = {
    database: env.PGDATABASE,
    host: env.PGHOST,
    port: env.PGPORT,
    user: env.PGUSER,
    password: env.PGPASSWORD,
    application_name: env.PGAPPNAME,
  }
}

const DEFAULT_CONNECTION_PARAMS = {
  host: "127.0.0.1",
  port: "5432",
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
  database: string;
  host: string;
  port: string;
  user: string;
  password?: string;
  application_name?: string;
  // TODO: support other params

  constructor(config?: string | IConnectionParams) {
    if (!config) {
      config = {};
    }

    if (typeof config === "string") {
      const dsn = parseDsn(config);
      if (dsn.driver !== "postgres") {
        throw new Error(`Supplied DSN has invalid driver: ${dsn.driver}.`);
      }

      this.database = dsn.database || pgEnv.database;
      this.host = dsn.host || pgEnv.host || DEFAULT_CONNECTION_PARAMS.host;
      this.port = dsn.port || pgEnv.port || DEFAULT_CONNECTION_PARAMS.port;
      this.user = dsn.user || pgEnv.user;
      this.password = dsn.password || pgEnv.password;
      this.application_name = dsn.params.application_name || pgEnv.application_name || DEFAULT_CONNECTION_PARAMS.application_name;
    } else {
      this.database = config.database || pgEnv.database;
      this.host = config.host || pgEnv.host || DEFAULT_CONNECTION_PARAMS.host;
      this.port = config.port || pgEnv.port || DEFAULT_CONNECTION_PARAMS.port;
      this.user = config.user || pgEnv.user;
      this.password = config.password || pgEnv.password;
      this.application_name = config.application_name || pgEnv.application_name || DEFAULT_CONNECTION_PARAMS.application_name;
    }

    const missingParams: string[] = [];

    ["database", "user"].forEach(param => {
      if (!this[param]) {
        missingParams.push(param);
      }
    });

    if (missingParams.length) {
      // TODO: better error and information message. Add notice about env variables
      throw new Error(`Missing connection parameters: ${missingParams.join(", ")}`);
    }
  }
}
