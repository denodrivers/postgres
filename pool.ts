import { PoolClient } from "./client.ts";
import { Connection } from "./connection.ts";
import {
  ConnectionOptions,
  ConnectionParams,
  createParams,
} from "./connection_params.ts";
import { DeferredStack } from "./deferred.ts";
import { Query, QueryConfig, QueryResult } from "./query.ts";

export class Pool {
  private _connectionParams: ConnectionParams;
  private _connections!: Array<Connection>;
  private _availableConnections!: DeferredStack<Connection>;
  private _maxSize: number;
  private _ready: Promise<void>;
  private _lazy: boolean;

  constructor(
    connectionParams: ConnectionOptions,
    maxSize: number,
    lazy?: boolean,
  ) {
    this._connectionParams = createParams(connectionParams);
    this._maxSize = maxSize;
    this._lazy = !!lazy;
    this._ready = this._startup();
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
    return this._availableConnections.size;
  }

  /** number of available connections */
  get available(): number {
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

  private async _execute(query: Query): Promise<QueryResult> {
    await this._ready;
    const connection = await this._availableConnections.pop();
    try {
      const result = await connection.query(query);
      return result;
    } catch (error) {
      throw error;
    } finally {
      this._availableConnections.push(connection);
    }
  }

  async connect(): Promise<PoolClient> {
    await this._ready;
    const connection = await this._availableConnections.pop();
    const release = () => this._availableConnections.push(connection);
    return new PoolClient(connection, release);
  }

  // TODO: can we use more specific type for args?
  async query(
    text: string | QueryConfig,
    ...args: any[]
  ): Promise<QueryResult> {
    const query = new Query(text, ...args);
    return await this._execute(query);
  }

  async end(): Promise<void> {
    await this._ready;
    while (this.available > 0) {
      const conn = await this._availableConnections.pop();
      await conn.end();
    }
  }

  // Support `using` module
  _aenter = () => {};
  _aexit = this.end;
}
