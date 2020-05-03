import { parseDsn } from "./utils.ts";

function getPgEnv(): ConnectionOptions {
  try {
    const env = Deno.env;
    const port = env.get("PGPORT");
    return {
      database: env.get("PGDATABASE"),
      hostname: env.get("PGHOST"),
      port: port !== undefined ? parseInt(port, 10) : undefined,
      user: env.get("PGUSER"),
      password: env.get("PGPASSWORD"),
      application_name: env.get("PGAPPNAME"),
    };
  } catch (e) {
    // PermissionDenied (--allow-env not passed)
    return {};
  }
}

function isDefined<T>(value: T): value is NonNullable<T> {
  return value !== undefined && value !== null;
}

class ConnectionParamsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionParamsError";
  }
}

export interface ConnectionOptions {
  database?: string;
  hostname?: string;
  port?: number;
  user?: string;
  password?: string;
  application_name?: string;
}

export interface ConnectionParams {
  database: string;
  hostname: string;
  port: number;
  user: string;
  password?: string;
  application_name: string;
  // TODO: support other params
}

function select<T extends keyof ConnectionOptions>(
  sources: ConnectionOptions[],
  key: T,
): ConnectionOptions[T] {
  return sources.map((s) => s[key]).find(isDefined);
}

function selectRequired<T extends keyof ConnectionOptions>(
  sources: ConnectionOptions[],
  key: T,
): NonNullable<ConnectionOptions[T]> {
  const result = select(sources, key);

  if (!isDefined(result)) {
    throw new ConnectionParamsError(`Required parameter ${key} not provided`);
  }

  return result;
}

function assertRequiredOptions(
  sources: ConnectionOptions[],
  requiredKeys: (keyof ConnectionOptions)[],
) {
  const missingParams: (keyof ConnectionOptions)[] = [];
  for (const key of requiredKeys) {
    if (!isDefined(select(sources, key))) {
      missingParams.push(key);
    }
  }

  if (missingParams.length) {
    throw new ConnectionParamsError(formatMissingParams(missingParams));
  }
}

function formatMissingParams(missingParams: string[]) {
  return `Missing connection parameters: ${
    missingParams.join(
      ", ",
    )
  }. Connection parameters can be read from environment only if Deno is run with env permission (deno run --allow-env)`;
}

const DEFAULT_OPTIONS: ConnectionOptions = {
  hostname: "127.0.0.1",
  port: 5432,
  application_name: "deno_postgres",
};

export function createParams(
  config: string | ConnectionOptions = {},
): ConnectionParams {
  if (typeof config === "string") {
    const dsn = parseDsn(config);
    return createParams({
      ...dsn,
      port: parseInt(dsn.port, 10),
    });
  }

  const pgEnv = getPgEnv();

  const sources = [config, pgEnv, DEFAULT_OPTIONS];
  assertRequiredOptions(
    sources,
    ["database", "hostname", "port", "user", "application_name"],
  );

  const params = {
    database: selectRequired(sources, "database"),
    hostname: selectRequired(sources, "hostname"),
    port: selectRequired(sources, "port"),
    application_name: selectRequired(sources, "application_name"),
    user: selectRequired(sources, "user"),
    password: select(sources, "password"),
  };

  if (isNaN(params.port)) {
    throw new ConnectionParamsError(`Invalid port ${params.port}`);
  }

  return params;
}
