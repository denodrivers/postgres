// deno-lint-ignore-file camelcase
import { parseDsn } from "../utils/utils.ts";

/**
 * The connection string must match the following URI structure
 *
 * ```ts
 * const connection = "postgres://user:password@hostname:port/database?application_name=application_name";
 * ```
 *
 * Password, port and application name are optional parameters
 */
export type ConnectionString = string;

/**
 * This function retrieves the connection options from the environmental variables
 * as they are, without any extra parsing
 *
 * It will throw if no env permission was provided on startup
 */
function getPgEnv(): ClientOptions {
  return {
    database: Deno.env.get("PGDATABASE"),
    hostname: Deno.env.get("PGHOST"),
    port: Deno.env.get("PGPORT"),
    user: Deno.env.get("PGUSER"),
    password: Deno.env.get("PGPASSWORD"),
    applicationName: Deno.env.get("PGAPPNAME"),
  };
}

export class ConnectionParamsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionParamsError";
  }
}

export interface ConnectionOptions {
  /**
   * By default, any client will only attempt to stablish
   * connection with your database once. Setting this parameter
   * will cause the client to attempt reconnection as many times
   * as requested before erroring
   *
   * default: `1`
   */
  attempts: number;
}

export interface TLSOptions {
  /**
   * If TLS support is enabled or not. If the server requires TLS,
   * the connection will fail.
   */
  enabled: boolean;
  /**
   * This will force the connection to run over TLS
   * If the server doesn't support TLS, the connection will fail
   *
   * default: `false`
   * */
  enforce: boolean;
}

export interface ClientOptions {
  applicationName?: string;
  connection?: Partial<ConnectionOptions>;
  database?: string;
  hostname?: string;
  password?: string;
  port?: string | number;
  tls?: Partial<TLSOptions>;
  user?: string;
}

export interface ClientConfiguration {
  applicationName: string;
  connection: ConnectionOptions;
  database: string;
  hostname: string;
  password?: string;
  port: number;
  tls: TLSOptions;
  user: string;
}

function formatMissingParams(missingParams: string[]) {
  return `Missing connection parameters: ${
    missingParams.join(
      ", ",
    )
  }`;
}

/**
 * This validates the options passed are defined and have a value other than null
 * or empty string, it throws a connection error otherwise
 *
 * @param has_env_access This parameter will change the error message if set to true,
 * telling the user to pass env permissions in order to read environmental variables
 */
function assertRequiredOptions(
  options: Partial<ClientConfiguration>,
  requiredKeys: (keyof ClientOptions)[],
  has_env_access: boolean,
): asserts options is ClientConfiguration {
  const missingParams: (keyof ClientOptions)[] = [];
  for (const key of requiredKeys) {
    if (
      options[key] === "" ||
      options[key] === null ||
      options[key] === undefined
    ) {
      missingParams.push(key);
    }
  }

  if (missingParams.length) {
    let missing_params_message = formatMissingParams(missingParams);
    if (!has_env_access) {
      missing_params_message +=
        "\nConnection parameters can be read from environment variables only if Deno is run with env permission";
    }

    throw new ConnectionParamsError(missing_params_message);
  }
}

function parseOptionsFromDsn(connString: string): ClientOptions {
  const dsn = parseDsn(connString);

  if (dsn.driver !== "postgres" && dsn.driver !== "postgresql") {
    throw new ConnectionParamsError(
      `Supplied DSN has invalid driver: ${dsn.driver}.`,
    );
  }

  let enabled = true;
  let enforceTls = false;
  if (dsn.params.sslmode) {
    const sslmode = dsn.params.sslmode;
    delete dsn.params.sslmode;

    if (!["disable", "require", "prefer"].includes(sslmode)) {
      throw new ConnectionParamsError(
        `Supplied DSN has invalid sslmode '${sslmode}'. Only 'disable', 'require', and 'prefer' are supported`,
      );
    }

    if (sslmode === "require") {
      enforceTls = true;
    }

    if (sslmode === "disable") {
      enabled = false;
    }
  }

  return {
    ...dsn,
    tls: { enabled, enforce: enforceTls },
    applicationName: dsn.params.application_name,
  };
}

const DEFAULT_OPTIONS: Omit<ClientConfiguration, "database" | "user"> = {
  applicationName: "deno_postgres",
  connection: {
    attempts: 1,
  },
  hostname: "127.0.0.1",
  port: 5432,
  tls: {
    enabled: true,
    enforce: false,
  },
};

export function createParams(
  params: string | ClientOptions = {},
): ClientConfiguration {
  if (typeof params === "string") {
    params = parseOptionsFromDsn(params);
  }

  let pgEnv: ClientOptions = {};
  let has_env_access = true;
  try {
    pgEnv = getPgEnv();
  } catch (e) {
    if (e instanceof Deno.errors.PermissionDenied) {
      has_env_access = false;
    } else {
      throw e;
    }
  }

  let port: number;
  if (params.port) {
    port = Number(params.port);
  } else if (pgEnv.port) {
    port = Number(pgEnv.port);
  } else {
    port = DEFAULT_OPTIONS.port;
  }
  if (Number.isNaN(port) || port === 0) {
    throw new ConnectionParamsError(
      `"${params.port ?? pgEnv.port}" is not a valid port number`,
    );
  }

  // TODO
  // Perhaps username should be taken from the PC user as a default?
  const connection_options = {
    applicationName: params.applicationName ?? pgEnv.applicationName ??
      DEFAULT_OPTIONS.applicationName,
    connection: {
      attempts: params?.connection?.attempts ??
        DEFAULT_OPTIONS.connection.attempts,
    },
    database: params.database ?? pgEnv.database,
    hostname: params.hostname ?? pgEnv.hostname ?? DEFAULT_OPTIONS.hostname,
    password: params.password ?? pgEnv.password,
    port,
    tls: {
      enabled: !!params?.tls?.enabled ?? DEFAULT_OPTIONS.tls.enabled,
      enforce: !!params?.tls?.enforce ?? DEFAULT_OPTIONS.tls.enforce,
    },
    user: params.user ?? pgEnv.user,
  };

  assertRequiredOptions(
    connection_options,
    ["applicationName", "database", "hostname", "port", "user"],
    has_env_access,
  );

  return connection_options;
}
