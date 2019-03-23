import { Client, PooledClient } from "./client.ts";
import { Connection } from "./connection.ts";
import { ConnectionParams, IConnectionParams } from "./connection_params.ts";
import { Query, QueryConfig, QueryResult } from "./query.ts";
import { defer, Deferred } from "./deps.ts";

export class Pool {
  private _connectionParams: IConnectionParams;
  private _connections: Array<Connection>;
  private _availableConnections: DeferredStack<Connection>;
  private _size: number;
  private _ready: Promise<void>;

  constructor(connectionParams: IConnectionParams, size: number) {
    this._connectionParams = connectionParams;
    this._size = size;
    this._ready = this._startup();
  }

  private async _createConnection(): Promise<Connection> {
    const connection = new Connection(this._connectionParams);
    await connection.startup();
    await connection.initSQL();
    return connection;
  }

  get size(): number {
    return this._size;
  }

  get available(): number {
    return this._availableConnections.size;
  }

  private async _startup(): Promise<void> {
    const connecting = [...Array(this.size)].map(
      async () => await this._createConnection()
    );
    this._connections = await Promise.all(connecting);
    this._availableConnections = new DeferredStack(this._connections);
  }

  private async _execute(query: Query): Promise<QueryResult> {
    await this._ready;
    const connection = await this._availableConnections.pop();
    const result = await connection.query(query);
    this._availableConnections.push(connection);
    return result;
  }

  async connect(): Promise<Client> {
    await this._ready;
    const connection = await this._availableConnections.pop();
    const release = () => this._availableConnections.push(connection);
    return new PooledClient(connection, release);
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
    const ending = this._connections.map(c => c.end());
    await Promise.all(ending);
  }

  // Support `using` module
  _aenter = () => {};
  _aexit = this.end;
}

// perhaps this should be exported somewhere?
class DeferredStack<T> {
  private _array: Array<T>;
  private _queue: Array<Deferred>;
  constructor(ls?: Iterable<T>) {
    this._array = ls ? [...ls] : [];
    this._queue = [];
  }
  async pop(): Promise<T> {
    if (this._array.length > 0) {
      return this._array.pop();
    }
    const d = defer();
    this._queue.push(d);
    await d.promise;
    return this._array.pop();
  }
  push(value: T): void {
    this._array.push(value);
    if (this._queue.length > 0) {
      const d = this._queue.shift();
      d.resolve();
    }
  }
  get size(): number {
    return this._array.length;
  }
}
