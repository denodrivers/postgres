import { parseDsn } from "./utils.ts";

function getPgEnv(): IConnectionParams {
  try {
    const env = Deno.env();
    return {
      database: env.PGDATABASE,
      host: env.PGHOST,
      port: env.PGPORT,
      user: env.PGUSER,
      password: env.PGPASSWORD,
      application_name: env.PGAPPNAME,
    };
  } catch (e) {
    // PermissionDenied (--allow-env not passed)
    return {};
  }
}

function selectFrom(
  sources: Array<IConnectionParams>,
  key: keyof IConnectionParams,
): string | undefined {
  for (const source of sources) {
    if (source[key]) {
      return source[key];
    }
  }

  return undefined;
}

function selectFromWithDefault(
  sources: Array<IConnectionParams>,
  key: keyof typeof DEFAULT_CONNECTION_PARAMS,
): string {
  return selectFrom(sources, key) || DEFAULT_CONNECTION_PARAMS[key];
}

const DEFAULT_CONNECTION_PARAMS = {
  host: "127.0.0.1",
  port: "5432",
  application_name: "deno_postgres",
};

export interface IConnectionParams {
  database?: string;
  host?: string;
  port?: string;
  user?: string;
  password?: string;
  application_name?: string;
  certFile?: string;
}

class ConnectionParamsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionParamsError";
  }
}

export class ConnectionParams {
  database!: string;
  host: string;
  port: string;
  user!: string;
  password?: string;
  application_name: string;
  certFile?: string;
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

    let potentiallyNull: { [K in keyof IConnectionParams]?: string } = {
      database: selectFrom([config, pgEnv], "database"),
      user: selectFrom([config, pgEnv], "user"),
    };

    this.host = selectFromWithDefault([config, pgEnv], "host");
    this.port = selectFromWithDefault([config, pgEnv], "port");
    this.application_name = selectFromWithDefault(
      [config, pgEnv],
      "application_name",
    );
    this.password = selectFrom([config, pgEnv], "password");
    this.certFile = selectFrom([config, pgEnv], "certFile");

    const missingParams: string[] = [];

    (["database", "user"] as Array<keyof IConnectionParams>).forEach(
      (param) => {
        if (potentiallyNull[param]) {
          this[param] = potentiallyNull[param]!;
        } else {
          missingParams.push(param);
        }
      },
    );

    if (missingParams.length) {
      throw new ConnectionParamsError(
        `Missing connection parameters: ${missingParams.join(
          ", ",
        )}. Connection parameters can be read
        from environment only if Deno is run with env permission (deno run --allow-env)`,
      );
    }
  }
}
