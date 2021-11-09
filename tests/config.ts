import { ClientOptions } from "../connection/connection_params.ts";

type ConfigFileConnection = Pick<
  ClientOptions,
  "applicationName" | "database" | "hostname" | "password" | "port"
>;

type Classic = ConfigFileConnection & {
  users: {
    clear: string;
    main: string;
    md5: string;
    tls_only: string;
  };
};

type Scram = ConfigFileConnection & {
  users: {
    scram: string;
  };
};

interface EnvironmentConfig {
  postgres_classic: Classic;
  postgres_scram: Scram;
}

const config_file: {
  ci: EnvironmentConfig;
  local: EnvironmentConfig;
} = JSON.parse(
  await Deno.readTextFile(new URL("./config.json", import.meta.url)),
);

const config = Deno.env.get("DENO_POSTGRES_DEVELOPMENT") === "true"
  ? config_file.local
  : config_file.ci;

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
  enabled: false,
};

export const getClearConfiguration = (
  tls: boolean,
): ClientOptions => {
  return {
    applicationName: config.postgres_classic.applicationName,
    database: config.postgres_classic.database,
    hostname: config.postgres_classic.hostname,
    password: config.postgres_classic.password,
    port: config.postgres_classic.port,
    tls: tls ? enabled_tls : disabled_tls,
    user: config.postgres_classic.users.clear,
  };
};

/** MD5 authenticated user with privileged access to the database */
export const getMainConfiguration = (): ClientOptions => {
  return {
    applicationName: config.postgres_classic.applicationName,
    database: config.postgres_classic.database,
    hostname: config.postgres_classic.hostname,
    password: config.postgres_classic.password,
    port: config.postgres_classic.port,
    tls: enabled_tls,
    user: config.postgres_classic.users.main,
  };
};

export const getMd5Configuration = (tls: boolean): ClientOptions => {
  return {
    applicationName: config.postgres_classic.applicationName,
    database: config.postgres_classic.database,
    hostname: config.postgres_classic.hostname,
    password: config.postgres_classic.password,
    port: config.postgres_classic.port,
    tls: tls ? enabled_tls : disabled_tls,
    user: config.postgres_classic.users.md5,
  };
};

export const getScramConfiguration = (tls: boolean): ClientOptions => {
  return {
    applicationName: config.postgres_scram.applicationName,
    database: config.postgres_scram.database,
    hostname: config.postgres_scram.hostname,
    password: config.postgres_scram.password,
    port: config.postgres_scram.port,
    tls: tls ? enabled_tls : disabled_tls,
    user: config.postgres_scram.users.scram,
  };
};

export const getTlsOnlyConfiguration = (): ClientOptions => {
  return {
    applicationName: config.postgres_classic.applicationName,
    database: config.postgres_classic.database,
    hostname: config.postgres_classic.hostname,
    password: config.postgres_classic.password,
    port: config.postgres_classic.port,
    tls: enabled_tls,
    user: config.postgres_classic.users.tls_only,
  };
};
