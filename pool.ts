import { PoolClient } from "./client.ts";
import { Connection, ResultType } from "./connection.ts";
import {
  ConnectionOptions,
  ConnectionParams,
  createParams,
} from "./connection_params.ts";
import { DeferredStack } from "./deferred.ts";
import {
  Query,
  QueryArrayResult,
  QueryConfig,
  QueryObjectConfig,
  QueryObjectResult,
} from "./query.ts";

// TODO
// This whole construct might be redundant to PoolClient
export class Pool {
  private _connectionParams: ConnectionParams;
  private _connections!: Array<Connection>;
  private _availableConnections!: DeferredStack<Connection>;
  private _maxSize: number;
  public ready: Promise<void>;
  private _lazy: boolean;

  constructor(
    connectionParams: ConnectionOptions,
    maxSize: number,
    lazy?: boolean,
  ) {
    this._connectionParams = createParams(connectionParams);
    this._maxSize = maxSize;
    this._lazy = !!lazy;
    this.ready = this._startup();
  }

  private async _createConnection(): Promise<Connection> {
    const connection = new Connection(this._connectionParams);
    await connection.startup();
    await connection.initSQL();
    return connection;
  }

  /** pool max size */
  get maxSize(): number {
    return this._maxSize;
  }

  /** number of connections created */
  get size(): number {
    if (this._availableConnections == null) {
      return 0;
    }
    return this._availableConnections.size;
  }

  /** number of available connections */
  get available(): number {
    if (this._availableConnections == null) {
      return 0;
    }
    return this._availableConnections.available;
  }

  private async _startup(): Promise<void> {
    const initSize = this._lazy ? 1 : this._maxSize;
    const connecting = [...Array(initSize)].map(async () =>
      await this._createConnection()
    );
    this._connections = await Promise.all(connecting);
    this._availableConnections = new DeferredStack(
      this._maxSize,
      this._connections,
      this._createConnection.bind(this),
    );
  }

  private async _execute<T extends unknown[]>(
    query: Query,
    type: ResultType.ARRAY,
  ): Promise<QueryArrayResult<T>>;
  private async _execute<T extends Record<string, unknown>>(
    query: Query,
    type: ResultType.OBJECT,
  ): Promise<QueryObjectResult<T>>;
  private async _execute(query: Query, type: ResultType) {
    await this.ready;
    const connection = await this._availableConnections.pop();
    try {
      return (await connection.query(query, type as any)) as any;
    } catch (error) {
      throw error;
    } finally {
      this._availableConnections.push(connection);
    }
  }

  async connect(): Promise<PoolClient> {
    await this.ready;
    const connection = await this._availableConnections.pop();
    const release = () => this._availableConnections.push(connection);
    return new PoolClient(connection, release);
  }

  // TODO: can we use more specific type for args?
  async queryArray<T extends Array<unknown> = Array<unknown>>(
    text: string | QueryConfig,
    // deno-lint-ignore no-explicit-any
    ...args: any[]
  ) {
    let query;
    if (typeof text === "string") {
      query = new Query(text, ...args);
    } else {
      query = new Query(text);
    }
    return await this._execute<T>(query, ResultType.ARRAY);
  }

  async queryObject<
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
    return await this._execute<T>(query, ResultType.OBJECT);
  }

  async end(): Promise<void> {
    await this.ready;
    while (this.available > 0) {
      const conn = await this._availableConnections.pop();
      await conn.end();
    }
  }

  // Support `using` module
  _aenter = () => {};
  _aexit = this.end;
}
