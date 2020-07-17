import { Connection } from "./connection.ts";
import {
  ConnectionOptions,
  ConnectionParams,
  createParams,
} from "./connection_params.ts";
import { Query, QueryConfig, QueryResult } from "./query.ts";

// deno-lint-ignore no-explicit-any
function instanceOfConnectionParams(object: any): object is ConnectionParams {
  return object.conn !== undefined;
}

export class Client {
  protected _connection: Connection;

  constructor(config?: ConnectionParams | ConnectionOptions | string) {
    const connectionParams = instanceOfConnectionParams(config)
      ? config
      : createParams(config);
    this._connection = new Connection(connectionParams);
  }

  async connect(): Promise<void> {
    await this._connection.startup();
    await this._connection.initSQL();
  }

  // TODO: can we use more specific type for args?
  async query(
    text: string | QueryConfig,
    // deno-lint-ignore no-explicit-any
    ...args: any[]
  ): Promise<QueryResult> {
    const query = new Query(text, ...args);
    return await this._connection.query(query);
  }

  async multiQuery(queries: QueryConfig[]): Promise<QueryResult[]> {
    const result: QueryResult[] = [];

    for (const query of queries) {
      result.push(await this.query(query));
    }

    return result;
  }

  async end(): Promise<void> {
    await this._connection.end();
  }

  // Support `using` module
  _aenter = this.connect;
  _aexit = this.end;
}

export class PoolClient {
  protected _connection: Connection;
  private _releaseCallback: () => void;

  constructor(connection: Connection, releaseCallback: () => void) {
    this._connection = connection;
    this._releaseCallback = releaseCallback;
  }

  async query(
    text: string | QueryConfig,
    // deno-lint-ignore no-explicit-any
    ...args: any[]
  ): Promise<QueryResult> {
    const query = new Query(text, ...args);
    return await this._connection.query(query);
  }

  async release(): Promise<void> {
    await this._releaseCallback();
  }
}
