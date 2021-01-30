import { Connection, ResultType } from "./connection.ts";
import {
  ConnectionOptions,
  ConnectionString,
  createParams,
} from "./connection_params.ts";
import {
  Query,
  QueryArrayResult,
  QueryConfig,
  QueryObjectConfig,
  QueryObjectResult,
  QueryResult,
} from "./query.ts";

// TODO
// Limit the type of parameters that can be passed
// to a query
/**
 * https://www.postgresql.org/docs/current/sql-prepare.html
 * 
 * This arguments will be appended to the prepared statement passed
 * as query
 * 
 * They will take the position according to the order in which they were provided
 * 
 * ```ts
 * await my_client.queryArray(
 *  "SELECT ID, NAME FROM PEOPLE WHERE AGE > $1 AND AGE < $2",
 *  10, // $1
 *  20, // $2
 * );
 * ```
 * */
// deno-lint-ignore no-explicit-any
type QueryArguments = any[];

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

  /**
   * This method allows executed queries to be retrieved as array entries.
   * It supports a generic interface in order to type the entries retrieved by the query
   * 
   * ```ts
   * const {rows} = await my_client.queryArray(
   *  "SELECT ID, NAME FROM CLIENTS"
   * ); // Array<unknown[]>
   * 
   * const {rows} = await my_client.queryArray<[number, string]>(
   *  "SELECT ID, NAME FROM CLIENTS"
   * ); // Array<[number, string]>
   * ```
   */
  queryArray<T extends Array<unknown>>(
    query: string,
    ...args: QueryArguments
  ): Promise<QueryArrayResult<T>>;
  queryArray<T extends Array<unknown>>(
    config: QueryConfig,
  ): Promise<QueryArrayResult<T>>;
  queryArray<T extends Array<unknown> = Array<unknown>>(
    // deno-lint-ignore camelcase
    query_or_config: string | QueryConfig,
    ...args: QueryArguments
  ): Promise<QueryArrayResult<T>> {
    let query;
    if (typeof query_or_config === "string") {
      query = new Query(query_or_config, ...args);
    } else {
      query = new Query(query_or_config);
    }

    return this._executeQuery(
      query,
      ResultType.ARRAY,
    ) as Promise<QueryArrayResult<T>>;
  }

  /**
   * This method allows executed queries to be retrieved as object entries.
   * It supports a generic interface in order to type the entries retrieved by the query
   * 
   * ```ts
   * const {rows} = await my_client.queryObject(
   *  "SELECT ID, NAME FROM CLIENTS"
   * ); // Record<string, unknown>
   * 
   * const {rows} = await my_client.queryObject<{id: number, name: string}>(
   *  "SELECT ID, NAME FROM CLIENTS"
   * ); // Array<{id: number, name: string}>
   * ```
   * 
   * You can also map the expected results to object fields using the configuration interface.
   * This will be assigned in the order they were provided
   * 
   * ```ts
   * const {rows} = await my_client.queryObject(
   *  "SELECT ID, NAME FROM CLIENTS"
   * );
   * 
   * console.log(rows); // [{id: 78, name: "Frank"}, {id: 15, name: "Sarah"}]
   * 
   * const {rows} = await my_client.queryObject({
   *  text: "SELECT ID, NAME FROM CLIENTS",
   *  fields: ["personal_id", "complete_name"],
   * });
   * 
   * console.log(rows); // [{personal_id: 78, complete_name: "Frank"}, {personal_id: 15, complete_name: "Sarah"}]
   * ```
   */
  queryObject<T extends Record<string, unknown>>(
    query: string,
    ...args: QueryArguments
  ): Promise<QueryObjectResult<T>>;
  queryObject<T extends Record<string, unknown>>(
    config: QueryObjectConfig,
  ): Promise<QueryObjectResult<T>>;
  queryObject<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(
    // deno-lint-ignore camelcase
    query_or_config: string | QueryObjectConfig,
    ...args: QueryArguments
  ): Promise<QueryObjectResult<T>> {
    let query;
    if (typeof query_or_config === "string") {
      query = new Query(query_or_config, ...args);
    } else {
      query = new Query(query_or_config);
    }

    return this._executeQuery(
      query,
      ResultType.OBJECT,
    ) as Promise<QueryObjectResult<T>>;
  }
}

export class Client extends QueryClient {
  protected _connection: Connection;

  constructor(config?: ConnectionOptions | ConnectionString) {
    super();
    this._connection = new Connection(createParams(config));
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
