import { ConnectionOptions } from "../connection/connection_params.ts";

const file = "config.json";
const path = new URL("config.json", import.meta.url);

let content = "{}";
try {
  content = await Deno.readTextFile(path);
} catch (e) {
  if (e instanceof Deno.errors.NotFound) {
    console.log(
      `"${file}" wasn't found in the tests directory, using environmental variables`,
    );
  } else {
    throw e;
  }
}

const config: {
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
} = JSON.parse(content);

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
