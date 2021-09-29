import { ClientOptions } from "../connection/connection_params.ts";
import { fromFileUrl } from "./test_deps.ts";

type ConfigFileConnection = Pick<
  ClientOptions,
  "applicationName" | "database" | "hostname" | "password" | "port"
>;

type Scram = ConfigFileConnection & {
  users: {
    scram: string;
  };
};

type Tls = ConfigFileConnection & {
  users: {
    clear: string;
    md5: string;
    tls_only: string;
  };
};

type Unencrypted = ConfigFileConnection & {
  users: {
    clear: string;
    main: string;
    md5: string;
  };
};

interface EnvironmentConfig {
  postgres: Unencrypted;
  postgres_scram: Scram;
  postgres_tls: Tls;
}

const config_file: {
  ci: EnvironmentConfig;
  local: EnvironmentConfig;
} = JSON.parse(
  await Deno.readTextFile(new URL("./config.json", import.meta.url)),
);

const config = Deno.env.get("DEVELOPMENT") === "true"
  ? config_file.local
  : config_file.ci;

const disabled_tls = {
  enabled: false,
};

export const getUnencryptedClearConfiguration = (): ClientOptions => {
  return {
    applicationName: config.postgres.applicationName,
    database: config.postgres.database,
    hostname: config.postgres.hostname,
    password: config.postgres.password,
    port: config.postgres.port,
    tls: disabled_tls,
    user: config.postgres.users.clear,
  };
};

/** MD5 authenticated user with privileged access to the database */
export const getUnencryptedMainConfiguration = (): ClientOptions => {
  return {
    applicationName: config.postgres.applicationName,
    database: config.postgres.database,
    hostname: config.postgres.hostname,
    password: config.postgres.password,
    port: config.postgres.port,
    tls: disabled_tls,
    user: config.postgres.users.main,
  };
};

export const getUnencryptedMd5Configuration = (): ClientOptions => {
  return {
    applicationName: config.postgres.applicationName,
    database: config.postgres.database,
    hostname: config.postgres.hostname,
    password: config.postgres.password,
    port: config.postgres.port,
    tls: disabled_tls,
    user: config.postgres.users.md5,
  };
};

export const getUnencryptedScramConfiguration = (): ClientOptions => {
  return {
    applicationName: config.postgres_scram.applicationName,
    database: config.postgres_scram.database,
    hostname: config.postgres_scram.hostname,
    password: config.postgres_scram.password,
    port: config.postgres_scram.port,
    tls: disabled_tls,
    user: config.postgres_scram.users.scram,
  };
};

const strict_tls_config = {
  caFile: fromFileUrl(new URL("../docker/certs/ca.crt", import.meta.url)),
  enabled: true,
  enforce: true,
};

export const getTlsClearConfiguration = (): ClientOptions => {
  return {
    applicationName: config.postgres_tls.applicationName,
    database: config.postgres_tls.database,
    hostname: config.postgres_tls.hostname,
    password: config.postgres_tls.password,
    port: config.postgres_tls.port,
    tls: strict_tls_config,
    user: config.postgres_tls.users.clear,
  };
};

export const getTlsMd5Configuration = (): ClientOptions => {
  return {
    applicationName: config.postgres_tls.applicationName,
    database: config.postgres_tls.database,
    hostname: config.postgres_tls.hostname,
    password: config.postgres_tls.password,
    port: config.postgres_tls.port,
    tls: strict_tls_config,
    user: config.postgres_tls.users.md5,
  };
};

export const getTlsOnlyConfiguration = (): ClientOptions => {
  return {
    applicationName: config.postgres_tls.applicationName,
    database: config.postgres_tls.database,
    hostname: config.postgres_tls.hostname,
    password: config.postgres_tls.password,
    port: config.postgres_tls.port,
    tls: strict_tls_config,
    user: config.postgres_tls.users.tls_only,
  };
};

export const getTlsScramConfiguration = (): ClientOptions => {
  return {
    applicationName: config.postgres_scram.applicationName,
    database: config.postgres_scram.database,
    hostname: config.postgres_scram.hostname,
    password: config.postgres_scram.password,
    port: config.postgres_scram.port,
    tls: strict_tls_config,
    user: config.postgres_scram.users.scram,
  };
};
