import { parseDsn } from "./utils.ts";

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
    // TODO: I don't really like that we require access to environment
    //  by default, maybe it should be flag-controlled?
    const envVars = Deno.env();

    if (!config) {
      config = {};
    }

    if (typeof config === "string") {
      const dsn = parseDsn(config);
      if (dsn.driver !== "postgres") {
        throw new Error(`Supplied DSN has invalid driver: ${dsn.driver}.`);
      }

      this.database = dsn.database || envVars.PGDATABASE;
      this.host = dsn.host || envVars.PGHOST || DEFAULT_CONNECTION_PARAMS.host;
      this.port = dsn.port || envVars.PGPORT || DEFAULT_CONNECTION_PARAMS.port;
      this.user = dsn.user || envVars.PGUSER;
      this.password = dsn.password || envVars.PGPASSWORD;
      this.application_name = dsn.params.application_name || envVars.PGAPPNAME || DEFAULT_CONNECTION_PARAMS.application_name;
    } else {
      this.database = config.database || envVars.PGDATABASE;
      this.host = config.host || envVars.PGHOST || DEFAULT_CONNECTION_PARAMS.host;
      this.port = config.port || envVars.PGPORT || DEFAULT_CONNECTION_PARAMS.port;
      this.user = config.user || envVars.PGUSER;
      this.password = config.password || envVars.PGPASSWORD;
      this.application_name = config.application_name || envVars.PGAPPNAME || DEFAULT_CONNECTION_PARAMS.application_name;
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
