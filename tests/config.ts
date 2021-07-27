// deno-lint-ignore-file camelcase
import { ConnectionOptions } from "../connection/connection_params.ts";

interface EnvironmentConfig {
  postgres: {
    applicationName: string;
    database: string;
    hostname: string;
    password: string;
    port: string | number;
    users: {
      clear: string;
      main: string;
      md5: string;
    };
  };
  postgres_scram: {
    applicationName: string;
    database: string;
    hostname: string;
    password: string;
    port: string | number;
    users: {
      scram: string;
    };
  };
  postgres_invalid_tls: {
    applicationName: string;
    database: string;
    hostname: string;
    password: string;
    port: string | number;
    tls: {
      enforce: boolean;
    };
    users: {
      main: string;
    };
  };
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

export const getClearConfiguration = (): ConnectionOptions => {
  return {
    applicationName: config.postgres.applicationName,
    database: config.postgres.database,
    hostname: config.postgres.hostname,
    password: config.postgres.password,
    port: config.postgres.port,
    user: config.postgres.users.clear,
  };
};

export const getMainConfiguration = (): ConnectionOptions => {
  return {
    applicationName: config.postgres.applicationName,
    database: config.postgres.database,
    hostname: config.postgres.hostname,
    password: config.postgres.password,
    port: config.postgres.port,
    user: config.postgres.users.main,
  };
};

export const getMd5Configuration = (): ConnectionOptions => {
  return {
    applicationName: config.postgres.applicationName,
    database: config.postgres.database,
    hostname: config.postgres.hostname,
    password: config.postgres.password,
    port: config.postgres.port,
    user: config.postgres.users.md5,
  };
};

export const getScramSha256Configuration = (): ConnectionOptions => {
  return {
    applicationName: config.postgres_scram.applicationName,
    database: config.postgres_scram.database,
    hostname: config.postgres_scram.hostname,
    password: config.postgres_scram.password,
    port: config.postgres_scram.port,
    user: config.postgres_scram.users.scram,
  };
};

export const getInvalidTlsConfiguration = (): ConnectionOptions => {
  return {
    applicationName: config.postgres_invalid_tls.applicationName,
    database: config.postgres_invalid_tls.database,
    hostname: config.postgres_invalid_tls.hostname,
    password: config.postgres_invalid_tls.password,
    port: config.postgres_invalid_tls.port,
    tls: {
      enabled: true,
      enforce: config.postgres_invalid_tls.tls.enforce,
    },
    user: config.postgres_invalid_tls.users.main,
  };
};
