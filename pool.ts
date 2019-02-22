import { Client } from "./client.ts";
import { Connection } from "./connection.ts";
import { ConnectionParams, IConnectionParams } from "./connection_params.ts";
import { QueryConfig, QueryResult } from "./query.ts";
import {
  defer,
  Deferred
} from "https://deno.land/x/std@v0.2.11/util/deferred.ts";

export class ConnectionPool {
  private _clients: Client[];
  private _availableClients: DeferredStack<Client>;
  private _connect: () => Promise<Connection>;
  private _size: number;
  private _connectionParams: ConnectionParams;

  constructor(size: number, config?: IConnectionParams | string) {
    this._connectionParams = new ConnectionParams(config);
    this._size = size;
  }

  get size() {
    return this._size;
  }

  async startup(): Promise<void> {
    const clients = [...Array(this.size)].map(async () => {
      const client = new Client({ ...this._connectionParams });
      await client.connect();
      return client;
    });
    this._clients = await Promise.all(clients);
    this._availableClients = new DeferredStack(this._clients);
  }

  async close(): Promise<void> {
    const ending = this._clients.map(async client => await client.end());
    await Promise.all(ending);
  }

  // TODO: can we use more specific type for args?
  async query(
    text: string | QueryConfig,
    ...args: any[]
  ): Promise<QueryResult> {
    const connection = await this._availableClients.pop();
    const result = await connection.query(text, ...args);
    this._availableClients.push(connection);
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
    // console.log("\nDEFERRED")
    this._queue.push(d);
    await d.promise;
    return this._array.pop();
  }

  push(value: T): void {
    // console.log("\nPUSH", this._array.length)
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
