import { env } from "deno";
import { parseDsn } from "./utils.ts";

let _env;
// allows to access environmentals lazily removing
// need to always add --allow-env permission to Deno
function lazyEnv() {
  if (!_env) {
    _env = env();
  }

  return _env;
}

export interface IConnectionParams {
  database?: string;
  host?: string;
  port?: string;
  user?: string;
  password?: string;
  application_name?: string;
}

export class ConnectionParams {
  database?: string;
  host?: string;
  port?: string;
  user?: string;
  password?: string;
  application_name?: string;
  // TODO: support other params

  constructor(config?: string | IConnectionParams) {
    if (!config) {
      config = {};
    }

    if (typeof config === "string") {
      const dsn = parseDsn(config);
      if (dsn.driver !== "postgres") {
        throw new Error(`Supplied DSN has invalid driver: ${dsn.driver}.`);
      }

      this.database = dsn.database || lazyEnv().PGDATABASE;
      this.host = dsn.host || lazyEnv().PGHOST;
      this.port = dsn.port || lazyEnv().PGPORT;
      this.user = dsn.user || lazyEnv().PGUSER;
      this.password = dsn.password || lazyEnv().PGPASSWORD;
      this.application_name =
        dsn.params.application_name || lazyEnv().PGAPPNAME;
    } else {
      this.database = config.database || lazyEnv().PGDATABASE;
      this.host = config.host || lazyEnv().PGHOST;
      this.port = config.port || lazyEnv().PGPORT;
      this.user = config.user || lazyEnv().PGUSER;
      this.password = config.password || lazyEnv().PGPASSWORD;
      this.application_name = config.application_name || lazyEnv().PGAPPNAME;
    }
  }
}
