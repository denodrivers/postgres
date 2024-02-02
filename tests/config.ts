import { ClientConfiguration } from "../connection/connection_params.ts";
import config_file1 from "./config.json" with { type: "json" };

type TcpConfiguration = Omit<ClientConfiguration, "connection"> & {
  host_type: "tcp";
};
type SocketConfiguration = Omit<ClientConfiguration, "connection" | "tls"> & {
  host_type: "socket";
};

let DEV_MODE: string | undefined;
try {
  DEV_MODE = Deno.env.get("DENO_POSTGRES_DEVELOPMENT");
} catch (e) {
  if (e instanceof Deno.errors.PermissionDenied) {
    throw new Error(
      "You need to provide ENV access in order to run the test suite",
    );
  }
  throw e;
}
const config = DEV_MODE === "true" ? config_file1.local : config_file1.ci;

const enabled_tls = {
  caCertificates: [
    Deno.readTextFileSync(
      new URL("../docker/certs/ca.crt", import.meta.url),
    ),
  ],
  enabled: true,
  enforce: true,
};

const disabled_tls = {
  caCertificates: [],
  enabled: false,
  enforce: false,
};

export const getClearConfiguration = (
  tls: boolean,
): TcpConfiguration => {
  return {
    applicationName: config.postgres_clear.applicationName,
    database: config.postgres_clear.database,
    host_type: "tcp",
    hostname: config.postgres_clear.hostname,
    options: {},
    password: config.postgres_clear.password,
    port: config.postgres_clear.port,
    tls: tls ? enabled_tls : disabled_tls,
    user: config.postgres_clear.users.clear,
  };
};

export const getClearSocketConfiguration = (): SocketConfiguration => {
  return {
    applicationName: config.postgres_clear.applicationName,
    database: config.postgres_clear.database,
    host_type: "socket",
    hostname: config.postgres_clear.socket,
    options: {},
    password: config.postgres_clear.password,
    port: config.postgres_clear.port,
    user: config.postgres_clear.users.socket,
  };
};

/** MD5 authenticated user with privileged access to the database */
export const getMainConfiguration = (): TcpConfiguration => {
  return {
    applicationName: config.postgres_md5.applicationName,
    database: config.postgres_md5.database,
    hostname: config.postgres_md5.hostname,
    host_type: "tcp",
    options: {},
    password: config.postgres_md5.password,
    port: config.postgres_md5.port,
    tls: enabled_tls,
    user: config.postgres_md5.users.main,
  };
};

export const getMd5Configuration = (tls: boolean): TcpConfiguration => {
  return {
    applicationName: config.postgres_md5.applicationName,
    database: config.postgres_md5.database,
    hostname: config.postgres_md5.hostname,
    host_type: "tcp",
    options: {},
    password: config.postgres_md5.password,
    port: config.postgres_md5.port,
    tls: tls ? enabled_tls : disabled_tls,
    user: config.postgres_md5.users.md5,
  };
};

export const getMd5SocketConfiguration = (): SocketConfiguration => {
  return {
    applicationName: config.postgres_md5.applicationName,
    database: config.postgres_md5.database,
    hostname: config.postgres_md5.socket,
    host_type: "socket",
    options: {},
    password: config.postgres_md5.password,
    port: config.postgres_md5.port,
    user: config.postgres_md5.users.socket,
  };
};

export const getScramConfiguration = (tls: boolean): TcpConfiguration => {
  return {
    applicationName: config.postgres_scram.applicationName,
    database: config.postgres_scram.database,
    hostname: config.postgres_scram.hostname,
    host_type: "tcp",
    options: {},
    password: config.postgres_scram.password,
    port: config.postgres_scram.port,
    tls: tls ? enabled_tls : disabled_tls,
    user: config.postgres_scram.users.scram,
  };
};

export const getScramSocketConfiguration = (): SocketConfiguration => {
  return {
    applicationName: config.postgres_scram.applicationName,
    database: config.postgres_scram.database,
    hostname: config.postgres_scram.socket,
    host_type: "socket",
    options: {},
    password: config.postgres_scram.password,
    port: config.postgres_scram.port,
    user: config.postgres_scram.users.socket,
  };
};

export const getTlsOnlyConfiguration = (): TcpConfiguration => {
  return {
    applicationName: config.postgres_md5.applicationName,
    database: config.postgres_md5.database,
    hostname: config.postgres_md5.hostname,
    host_type: "tcp",
    options: {},
    password: config.postgres_md5.password,
    port: config.postgres_md5.port,
    tls: enabled_tls,
    user: config.postgres_md5.users.tls_only,
  };
};
