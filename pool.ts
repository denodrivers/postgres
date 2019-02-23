import { dial } from "deno";
import { Connection } from "./connection.ts";
import { ConnectionParams, IConnectionParams } from "./connection_params.ts";
import { Query, QueryResult } from "./query.ts";
import { defer, Deferred } from "./deps.ts";

export class ConnectionPool {
  private _connectionParams: IConnectionParams;
  private _connections: Array<Connection>;
  private _availableConnections: DeferredStack<Connection>;
  private _size: number;

  constructor(connectionParams: IConnectionParams, size: number) {
    this._connectionParams = connectionParams;
    this._size = size;
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

  async startup(): Promise<void> {
    const connecting = [...Array(this.size)].map(
      async () => await this.newConnection()
    );
    this._connections = await Promise.all(connecting);
    this._availableConnections = new DeferredStack(this._connections);
  }

  async end(): Promise<void> {
    const ending = this._connections.map(c => c.end());
    await Promise.all(ending);
  }

  async execute(query: Query): Promise<QueryResult> {
    const connection = await this._availableConnections.pop();
    const result = await query.execute(connection);
    this._availableConnections.push(connection);
    return result;
  }
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
