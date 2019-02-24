import { dial } from "deno";
import { Client } from "./client.ts";
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
    this._ready = this.startup();
  }

  private async newConnection(): Promise<Connection> {
    const { host, port } = this._connectionParams;
    let addr = `${host}:${port}`;

    const conn = await dial("tcp", addr);
    const connection = new Connection(conn, this._connectionParams);

    await connection.startup({ ...this._connectionParams });
    await connection.initSQL();
    return connection;
  }

  get size(): number {
    return this._size;
  }
  get available(): number {
    return this._availableConnections.size;
  }

  private async startup(): Promise<void> {
    const connecting = [...Array(this.size)].map(
      async () => await this.newConnection()
    );
    this._connections = await Promise.all(connecting);
    this._availableConnections = new DeferredStack(this._connections);
  }

  async end(): Promise<void> {
    await this._ready;
    const ending = this._connections.map(c => c.end());
    await Promise.all(ending);
  }

  // TODO: can we use more specific type for args?
  async query(
    text: string | QueryConfig,
    ...args: any[]
  ): Promise<QueryResult> {
    const query = new Query(text, ...args);
    return await this.execute(query);
  }

  private async execute(query: Query): Promise<QueryResult> {
    await this._ready;
    const connection = await this._availableConnections.pop();
    const result = await query.execute(connection);
    this._availableConnections.push(connection);
    return result;
  }

  async connect(): Promise<Client> {
    await this._ready;
    const connection = await this._availableConnections.pop();
    const release = () => this._availableConnections.push(connection);
    return new Client(connection, release);
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
