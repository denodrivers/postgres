import { Connection } from "./connection.ts";
import { ConnectionParams } from "./connection_params.ts";
import { Query, QueryResult } from "./query.ts";
import { defer, Deferred } from "./deps.ts";

export class ConnectionPool {
  private _connections: Array<Connection>;
  private _availableConnections: DeferredStack<Connection>;
  private _connect: () => Promise<Connection>;
  private _size: number;

  constructor(connect: () => Promise<Connection>, size: number) {
    this._connect = connect;
    this._size = size;
  }

  get size(): number {
    return this._size;
  }
  get available(): number {
    return this._availableConnections.size;
  }

  async startup(): Promise<void> {
    const connecting = [...Array(this.size)].map(
      async () => await this._connect()
    );
    this._connections = await Promise.all(connecting);
    this._availableConnections = new DeferredStack(this._connections);
  }

  async end(): Promise<void> {
    const ending = this._connections.map(c => c.end());
    await Promise.all(ending);
  }

  // TODO: can we use more specific type for args?
  // async query(text: string | QueryConfig, ...args: any[]): Promise<QueryResult> {
  //     const connection = await this._availableConnections.pop()

  //     const result = await connection.query(text, ...args);
  //     this._availableConnections.push(connection);
  //     return result;
  // }

  async execute(query: Query) {
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
    // console.log("\nPOP", this._array.length)
    if (this._array.length > 0) {
      return this._array.pop();
    }
    const d = defer();
    //console.log("\nDEFERRED")
    this._queue.push(d);
    await d.promise;
    return this._array.pop();
  }
  push(value: T): void {
    //console.log("\nPUSH", this._array.length)
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
