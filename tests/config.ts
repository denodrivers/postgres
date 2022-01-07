import { ClientOptions } from "../connection/connection_params.ts";

type ConfigFileConnection = Pick<
  ClientOptions,
  "applicationName" | "database" | "hostname" | "password" | "port"
>;

type Clear = ConfigFileConnection & {
  users: {
    clear: string;
  };
};

type Classic = ConfigFileConnection & {
  users: {
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
  postgres_clear: Clear;
  postgres_md5: Classic;
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
    applicationName: config.postgres_clear.applicationName,
    database: config.postgres_clear.database,
    hostname: config.postgres_clear.hostname,
    password: config.postgres_clear.password,
    port: config.postgres_clear.port,
    tls: tls ? enabled_tls : disabled_tls,
    user: config.postgres_clear.users.clear,
  };
};

/** MD5 authenticated user with privileged access to the database */
export const getMainConfiguration = (): ClientOptions => {
  return {
    applicationName: config.postgres_md5.applicationName,
    database: config.postgres_md5.database,
    hostname: config.postgres_md5.hostname,
    password: config.postgres_md5.password,
    port: config.postgres_md5.port,
    tls: enabled_tls,
    user: config.postgres_md5.users.main,
  };
};

export const getMd5Configuration = (tls: boolean): ClientOptions => {
  return {
    applicationName: config.postgres_md5.applicationName,
    database: config.postgres_md5.database,
    hostname: config.postgres_md5.hostname,
    password: config.postgres_md5.password,
    port: config.postgres_md5.port,
    tls: tls ? enabled_tls : disabled_tls,
    user: config.postgres_md5.users.md5,
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
    applicationName: config.postgres_md5.applicationName,
    database: config.postgres_md5.database,
    hostname: config.postgres_md5.hostname,
    password: config.postgres_md5.password,
    port: config.postgres_md5.port,
    tls: enabled_tls,
    user: config.postgres_md5.users.tls_only,
  };
};
