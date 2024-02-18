import { parseConnectionUri } from "../utils/utils.ts";
import { ConnectionParamsError } from "../client/error.ts";
import { fromFileUrl, isAbsolute } from "../deps.ts";
import { OidType } from "../query/oid.ts";
import { DebugControls } from "../debug.ts";
import { ParseArrayFunction } from "../query/array_parser.ts";

/**
 * The connection string must match the following URI structure. All parameters but database and user are optional
 *
 * `postgres://user:password@hostname:port/database?sslmode=mode...`
 *
 * You can additionally provide the following url search parameters
 *
 * - application_name
 * - dbname
 * - host
 * - options
 * - password
 * - port
 * - sslmode
 * - user
 */
export type ConnectionString = string;

/**
 * Retrieves the connection options from the environmental variables
 * as they are, without any extra parsing
 *
 * It will throw if no env permission was provided on startup
 */
function getPgEnv(): ClientOptions {
  return {
    applicationName: Deno.env.get("PGAPPNAME"),
    database: Deno.env.get("PGDATABASE"),
    hostname: Deno.env.get("PGHOST"),
    options: Deno.env.get("PGOPTIONS"),
    password: Deno.env.get("PGPASSWORD"),
    port: Deno.env.get("PGPORT"),
    user: Deno.env.get("PGUSER"),
  };
}

/** Additional granular database connection options */
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
  /**
   * The time to wait before attempting each reconnection (in milliseconds)
   *
   * You can provide a fixed number or a function to call each time the
   * connection is attempted. By default, the interval will be a function
   * with an exponential backoff increasing by 500 milliseconds
   */
  interval: number | ((previous_interval: number) => number);
}

/** https://www.postgresql.org/docs/14/libpq-ssl.html#LIBPQ-SSL-PROTECTION */
type TLSModes = "disable" | "prefer" | "require" | "verify-ca" | "verify-full";

/** The Transport Layer Security (TLS) protocol options to be used by the database connection */
export interface TLSOptions {
  // TODO
  // Refactor enabled and enforce into one single option for 1.0
  /**
   * If TLS support is enabled or not. If the server requires TLS,
   * the connection will fail.
   *
   * Default: `true`
   */
  enabled: boolean;
  /**
   * Forces the connection to run over TLS
   * If the server doesn't support TLS, the connection will fail
   *
   * Default: `false`
   */
  enforce: boolean;
  /**
   * A list of root certificates that will be used in addition to the default
   * root certificates to verify the server's certificate.
   *
   * Must be in PEM format.
   *
   * Default: `[]`
   */
  caCertificates: string[];
}

/**
 * The strategy to use when decoding results data
 */
export type DecodeStrategy = "string" | "auto";
/**
 * A dictionary of functions used to decode (parse) column field values from string to a custom type. These functions will
 * take precedence over the {@linkcode DecodeStrategy}. Each key in the dictionary is the column OID type number or Oid type name,
 * and the value is the decoder function.
 */
export type Decoders = {
  [key in number | OidType]?: DecoderFunction;
};

/**
 * A decoder function that takes a string value and returns a parsed value of some type.
 *
 * @param value The string value to parse
 * @param oid The OID of the column type the value is from
 * @param parseArray A helper function that parses SQL array-formatted strings and parses each array value using a transform function.
 */
export type DecoderFunction = (
  value: string,
  oid: number,
  parseArray: ParseArrayFunction,
) => unknown;

/**
 * Control the behavior for the client instance
 */
export type ClientControls = {
  /**
   * Debugging options
   */
  debug?: DebugControls;
  /**
   * The strategy to use when decoding results data
   *
   * `string` : all values are returned as string, and the user has to take care of parsing
   * `auto` : deno-postgres parses the data into JS objects (as many as possible implemented, non-implemented parsers would still return strings)
   *
   * Default: `auto`
   *
   * Future strategies might include:
   * - `strict` : deno-postgres parses the data into JS objects, and if a parser is not implemented, it throws an error
   * - `raw` : the data is returned as Uint8Array
   */
  decodeStrategy?: DecodeStrategy;

  /**
   * A dictionary of functions used to decode (parse) column field values from string to a custom type. These functions will
   * take precedence over the {@linkcode ClientControls.decodeStrategy}. Each key in the dictionary is the column OID type number, and the value is
   * the decoder function. You can use the `Oid` object to set the decoder functions.
   *
   * @example
   * ```ts
   * import dayjs from 'https://esm.sh/dayjs';
   * import { Oid,Decoders } from '../mod.ts'
   *
   * {
   *   const decoders: Decoders = {
   *     //   16 = Oid.bool : convert all boolean values to numbers
   *     '16': (value: string) => value === 't' ? 1 : 0,
   *     // 1082 = Oid.date : convert all dates to dayjs objects
   *     1082: (value: string) => dayjs(value),
   *     //   23 = Oid.int4 : convert all integers to positive numbers
   *     [Oid.int4]: (value: string) => Math.max(0, parseInt(value || '0', 10)),
   *   }
   * }
   * ```
   */
  decoders?: Decoders;
};

/** The Client database connection options */
export type ClientOptions = {
  /** Name of the  application connecing to the database */
  applicationName?: string;
  /** Additional connection options */
  connection?: Partial<ConnectionOptions>;
  /** Control the client behavior */
  controls?: ClientControls;
  /** The database name */
  database?: string;
  /** The name of the host */
  hostname?: string;
  /** The type of host connection */
  host_type?: "tcp" | "socket";
  /**
   * Additional connection URI options
   * https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-PARAMKEYWORDS
   */
  options?: string | Record<string, string>;
  /** The database user password */
  password?: string;
  /** The database port used by the connection */
  port?: string | number;
  /**  */
  tls?: Partial<TLSOptions>;
  /** The database user */
  user?: string;
};

/** The configuration options required to set up a Client instance */
export type ClientConfiguration =
  & Required<
    Omit<
      ClientOptions,
      "password" | "port" | "tls" | "connection" | "options" | "controls"
    >
  >
  & {
    connection: ConnectionOptions;
    controls?: ClientControls;
    options: Record<string, string>;
    password?: string;
    port: number;
    tls: TLSOptions;
  };

function formatMissingParams(missingParams: string[]) {
  return `Missing connection parameters: ${missingParams.join(", ")}`;
}

/**
 * Validates the options passed are defined and have a value other than null
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

// TODO
// Support more options from the spec
/** options from URI per https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING */
interface PostgresUri {
  application_name?: string;
  dbname?: string;
  driver: string;
  host?: string;
  options?: string;
  password?: string;
  port?: string;
  sslmode?: TLSModes;
  user?: string;
}

function parseOptionsArgument(options: string): Record<string, string> {
  const args = options.split(" ");

  const transformed_args = [];
  for (let x = 0; x < args.length; x++) {
    if (/^-\w/.test(args[x])) {
      if (args[x] === "-c") {
        if (args[x + 1] === undefined) {
          throw new Error(
            `No provided value for "${args[x]}" in options parameter`,
          );
        }

        // Skip next iteration
        transformed_args.push(args[x + 1]);
        x++;
      } else {
        throw new Error(
          `Argument "${args[x]}" is not supported in options parameter`,
        );
      }
    } else if (/^--\w/.test(args[x])) {
      transformed_args.push(args[x].slice(2));
    } else {
      throw new Error(`Value "${args[x]}" is not a valid options argument`);
    }
  }

  return transformed_args.reduce((options, x) => {
    if (!/.+=.+/.test(x)) {
      throw new Error(`Value "${x}" is not a valid options argument`);
    }

    const key = x.slice(0, x.indexOf("="));
    const value = x.slice(x.indexOf("=") + 1);

    options[key] = value;

    return options;
  }, {} as Record<string, string>);
}

function parseOptionsFromUri(connection_string: string): ClientOptions {
  let postgres_uri: PostgresUri;
  try {
    const uri = parseConnectionUri(connection_string);
    postgres_uri = {
      application_name: uri.params.application_name,
      dbname: uri.path || uri.params.dbname,
      driver: uri.driver,
      host: uri.host || uri.params.host,
      options: uri.params.options,
      password: uri.password || uri.params.password,
      port: uri.port || uri.params.port,
      // Compatibility with JDBC, not standard
      // Treat as sslmode=require
      sslmode: uri.params.ssl === "true"
        ? "require"
        : (uri.params.sslmode as TLSModes),
      user: uri.user || uri.params.user,
    };
  } catch (e) {
    throw new ConnectionParamsError("Could not parse the connection string", e);
  }

  if (!["postgres", "postgresql"].includes(postgres_uri.driver)) {
    throw new ConnectionParamsError(
      `Supplied DSN has invalid driver: ${postgres_uri.driver}.`,
    );
  }

  // No host by default means socket connection
  const host_type = postgres_uri.host
    ? isAbsolute(postgres_uri.host) ? "socket" : "tcp"
    : "socket";

  const options = postgres_uri.options
    ? parseOptionsArgument(postgres_uri.options)
    : {};

  let tls: TLSOptions | undefined;
  switch (postgres_uri.sslmode) {
    case undefined: {
      break;
    }
    case "disable": {
      tls = { enabled: false, enforce: false, caCertificates: [] };
      break;
    }
    case "prefer": {
      tls = { enabled: true, enforce: false, caCertificates: [] };
      break;
    }
    case "require":
    case "verify-ca":
    case "verify-full": {
      tls = { enabled: true, enforce: true, caCertificates: [] };
      break;
    }
    default: {
      throw new ConnectionParamsError(
        `Supplied DSN has invalid sslmode '${postgres_uri.sslmode}'`,
      );
    }
  }

  return {
    applicationName: postgres_uri.application_name,
    database: postgres_uri.dbname,
    hostname: postgres_uri.host,
    host_type,
    options,
    password: postgres_uri.password,
    port: postgres_uri.port,
    tls,
    user: postgres_uri.user,
  };
}

const DEFAULT_OPTIONS:
  & Omit<
    ClientConfiguration,
    "database" | "user" | "hostname"
  >
  & { host: string; socket: string } = {
    applicationName: "deno_postgres",
    connection: {
      attempts: 1,
      interval: (previous_interval) => previous_interval + 500,
    },
    host: "127.0.0.1",
    socket: "/tmp",
    host_type: "socket",
    options: {},
    port: 5432,
    tls: {
      enabled: true,
      enforce: false,
      caCertificates: [],
    },
  };

export function createParams(
  params: string | ClientOptions = {},
): ClientConfiguration {
  if (typeof params === "string") {
    params = parseOptionsFromUri(params);
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

  const provided_host = params.hostname ?? pgEnv.hostname;

  // If a host is provided, the default connection type is TCP
  const host_type = params.host_type ??
    (provided_host ? "tcp" : DEFAULT_OPTIONS.host_type);
  if (!["tcp", "socket"].includes(host_type)) {
    throw new ConnectionParamsError(`"${host_type}" is not a valid host type`);
  }

  let host: string;
  if (host_type === "socket") {
    const socket = provided_host ?? DEFAULT_OPTIONS.socket;
    try {
      if (!isAbsolute(socket)) {
        const parsed_host = new URL(socket, Deno.mainModule);

        // Resolve relative path
        if (parsed_host.protocol === "file:") {
          host = fromFileUrl(parsed_host);
        } else {
          throw new Error("The provided host is not a file path");
        }
      } else {
        host = socket;
      }
    } catch (e) {
      throw new ConnectionParamsError(`Could not parse host "${socket}"`, e);
    }
  } else {
    host = provided_host ?? DEFAULT_OPTIONS.host;
  }

  const provided_options = params.options ?? pgEnv.options;

  let options: Record<string, string>;
  if (provided_options) {
    if (typeof provided_options === "string") {
      options = parseOptionsArgument(provided_options);
    } else {
      options = provided_options;
    }
  } else {
    options = {};
  }

  for (const key in options) {
    if (!/^\w+$/.test(key)) {
      throw new Error(`The "${key}" key in the options argument is invalid`);
    }

    options[key] = options[key].replaceAll(" ", "\\ ");
  }

  let port: number;
  if (params.port) {
    port = Number(params.port);
  } else if (pgEnv.port) {
    port = Number(pgEnv.port);
  } else {
    port = Number(DEFAULT_OPTIONS.port);
  }
  if (Number.isNaN(port) || port === 0) {
    throw new ConnectionParamsError(
      `"${params.port ?? pgEnv.port}" is not a valid port number`,
    );
  }

  if (host_type === "socket" && params?.tls) {
    throw new ConnectionParamsError(
      'No TLS options are allowed when host type is set to "socket"',
    );
  }
  const tls_enabled = !!(params?.tls?.enabled ?? DEFAULT_OPTIONS.tls.enabled);
  const tls_enforced = !!(params?.tls?.enforce ?? DEFAULT_OPTIONS.tls.enforce);

  if (!tls_enabled && tls_enforced) {
    throw new ConnectionParamsError(
      "Can't enforce TLS when client has TLS encryption is disabled",
    );
  }

  // TODO
  // Perhaps username should be taken from the PC user as a default?
  const connection_options = {
    applicationName: params.applicationName ??
      pgEnv.applicationName ??
      DEFAULT_OPTIONS.applicationName,
    connection: {
      attempts: params?.connection?.attempts ??
        DEFAULT_OPTIONS.connection.attempts,
      interval: params?.connection?.interval ??
        DEFAULT_OPTIONS.connection.interval,
    },
    database: params.database ?? pgEnv.database,
    hostname: host,
    host_type,
    options,
    password: params.password ?? pgEnv.password,
    port,
    tls: {
      enabled: tls_enabled,
      enforce: tls_enforced,
      caCertificates: params?.tls?.caCertificates ?? [],
    },
    user: params.user ?? pgEnv.user,
    controls: params.controls,
  };

  assertRequiredOptions(
    connection_options,
    ["applicationName", "database", "hostname", "host_type", "port", "user"],
    has_env_access,
  );

  return connection_options;
}
