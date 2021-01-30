import { Connection, ResultType } from "./connection.ts";
import { ConnectionOptions, createParams } from "./connection_params.ts";
import {
  Query,
  QueryArrayResult,
  QueryConfig,
  QueryObjectConfig,
  QueryObjectResult,
  QueryResult,
} from "./query.ts";

export class QueryClient {
  /**
   * This function is meant to be replaced when being extended
   * 
   * It's sole purpose is to be a common interface implementations can use
   * regardless of their internal structure
   */
  _executeQuery(_query: Query, _result: ResultType): Promise<QueryResult> {
    throw new Error(
      `"${this._executeQuery.name}" hasn't been implemented for class "${this.constructor.name}"`,
    );
  }

  queryArray<T extends Array<unknown> = Array<unknown>>(
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

    return this._executeQuery(
      query,
      ResultType.ARRAY,
    ) as Promise<QueryArrayResult<T>>;
  }

  queryObject<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(
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
    return this._executeQuery(
      query,
      ResultType.OBJECT,
    ) as Promise<QueryObjectResult<T>>;
  }
}

export class Client extends QueryClient {
  protected _connection: Connection;
  
  constructor(config?: ConnectionOptions | string) {
    super();
    this._connection = new Connection(createParams(config))
  }

  _executeQuery(query: Query, result: ResultType): Promise<QueryResult> {
    return this._connection.query(query, result);
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

export class PoolClient extends QueryClient {
  protected _connection: Connection;
  private _releaseCallback: () => void;

  constructor(connection: Connection, releaseCallback: () => void) {
    super();
    this._connection = connection;
    this._releaseCallback = releaseCallback;
  }

  _executeQuery(query: Query, result: ResultType): Promise<QueryResult> {
    return this._connection.query(query, result);
  }

  async release(): Promise<void> {
    await this._releaseCallback();
  }
}
