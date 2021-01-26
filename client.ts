import { Connection } from "./connection.ts";
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

  // TODO: can we use more specific type for args?
  async queryArray(
    text: string | QueryConfig,
    // deno-lint-ignore no-explicit-any
    ...args: any[]
  ): Promise<QueryArrayResult> {
    let query;
    if (typeof text === "string") {
      query = new Query(text, ...args);
    } else {
      query = new Query(text);
    }
    return await this._connection.query(query, "array");
  }

  async queryObject(
    text: string | QueryObjectConfig,
    // deno-lint-ignore no-explicit-any
    ...args: any[]
  ): Promise<QueryObjectResult> {
    let query;
    if (typeof text === "string") {
      query = new Query(text, ...args);
    } else {
      query = new Query(text);
    }
    return await this._connection.query(query, "object");
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

  /**
   * This method executes one query after another and the returns an array-like
   * result for each query
   * 
   * @deprecated Quite possibly going to be removed before 1.0
   * */
  async multiQuery(queries: QueryConfig[]): Promise<QueryArrayResult[]> {
    const result: QueryArrayResult[] = [];

    for (const query of queries) {
      result.push(await this.queryArray(query));
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
