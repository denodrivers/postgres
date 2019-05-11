import { parseDsn } from "./utils.ts";

function getPgEnv(): IConnectionParams {
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
      application_name: env.PGAPPNAME
    };
  }

  return pgEnv;
}

function selectFrom(sources: Object[], key: string): string | undefined {
  for (const source of sources) {
    if (source[key]) {
      return source[key];
    }
  }

  return undefined;
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

    const pgEnv = getPgEnv();

    if (typeof config === "string") {
      const dsn = parseDsn(config);
      if (dsn.driver !== "postgres") {
        throw new Error(`Supplied DSN has invalid driver: ${dsn.driver}.`);
      }
      config = dsn;
    }

    this.database = selectFrom([config, pgEnv], "database");
    this.host = selectFrom([config, pgEnv, DEFAULT_CONNECTION_PARAMS], "host");
    this.port = selectFrom([config, pgEnv, DEFAULT_CONNECTION_PARAMS], "port");
    this.user = selectFrom([config, pgEnv], "user");
    this.password = selectFrom([config, pgEnv], "password");
    this.application_name = selectFrom([config, pgEnv, DEFAULT_CONNECTION_PARAMS], "application_name");

    const missingParams: string[] = [];

    ["database", "user"].forEach(param => {
      if (!this[param]) {
        missingParams.push(param);
      }
    });

    if (missingParams.length) {
      // TODO: better error and information message. Add notice about env variables
      throw new Error(
        `Missing connection parameters: ${missingParams.join(", ")}`
      );
    }
  }
}
