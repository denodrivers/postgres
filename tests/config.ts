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
} = JSON.parse(content);

export const getClearConfiguration = (): ConnectionOptions => {
  return {
    applicationName: config.applicationName,
    database: config.database,
    hostname: config.hostname,
    password: config.password,
    port: config.port,
    user: config.users.main,
  };
};

export const getMainConfiguration = (): ConnectionOptions => {
  return {
    applicationName: config.applicationName,
    database: config.database,
    hostname: config.hostname,
    password: config.password,
    port: config.port,
    user: config.users.main,
  };
};

export const getMd5Configuration = (): ConnectionOptions => {
  return {
    applicationName: config.applicationName,
    database: config.database,
    hostname: config.hostname,
    password: config.password,
    port: config.port,
    user: config.users.main,
  };
};
