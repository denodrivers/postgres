import { Connection, ResultType } from "./connection.ts";
import { ConnectionOptions, createParams } from "./connection_params.ts";
import {
  Query,
  QueryArrayResult,
  QueryConfig,
  QueryObjectConfig,
  QueryObjectResult,
} from "./query.ts";

class BaseClient {
  protected _connection: Connection;

  constructor(connection: Connection) {
    this._connection = connection;
  }

  async queryArray<T extends Array<unknown> = Array<unknown>>(
    text: string | QueryConfig,
    // deno-lint-ignore no-explicit-any
    ...args: any[]
  ): Promise<QueryArrayResult<T>> {
    let query;
    if (typeof text === "string") {
      query = new Query(text, ...args);
    } else {
      query = new Query(text);
    }
    return await this._connection.query<T>(query, ResultType.ARRAY);
  }

  async queryObject<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string | QueryObjectConfig,
    // deno-lint-ignore no-explicit-any
    ...args: any[]
  ): Promise<QueryObjectResult<T>> {
    let query;
    if (typeof text === "string") {
      query = new Query(text, ...args);
    } else {
      query = new Query(text);
    }
    return await this._connection.query<T>(query, ResultType.OBJECT);
  }
}

export class Client extends BaseClient {
  constructor(config?: ConnectionOptions | string) {
    super(new Connection(createParams(config)));
  }

  async connect(): Promise<void> {
    await this._connection.startup();
    await this._connection.initSQL();
  }

  async end(): Promise<void> {
    await this._connection.end();
  }

  // Support `using` module
  _aenter = this.connect;
  _aexit = this.end;
}

export class PoolClient extends BaseClient {
  private _releaseCallback: () => void;

  constructor(connection: Connection, releaseCallback: () => void) {
    super(connection);
    this._releaseCallback = releaseCallback;
  }

  async release(): Promise<void> {
    await this._releaseCallback();
  }
}
