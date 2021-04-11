import { PoolClient, QueryClient } from "./client.ts";
import { Connection } from "./connection/connection.ts";
import {
  ConnectionOptions,
  ConnectionParams,
  ConnectionString,
  createParams,
} from "./connection/connection_params.ts";
import { DeferredStack } from "./connection/deferred.ts";
import {
  Query,
  QueryArrayResult,
  QueryObjectResult,
  QueryResult,
  ResultType,
} from "./query/query.ts";

// TODO
// Remove query execution methods from main pool
export class Pool {
  #connectionParams: ConnectionParams;
  // TODO
  // Cleanup initialization
  #connections!: Array<Connection>;
  #availableConnections!: DeferredStack<Connection>;
  #maxSize: number;
  // TODO
  // Initialization should probably have a startup
  public ready: Promise<void>;
  #lazy: boolean;

  constructor(
    connectionParams: ConnectionOptions | ConnectionString | undefined,
    maxSize: number,
    lazy?: boolean,
  ) {
    this.#connectionParams = createParams(connectionParams);
    this.#maxSize = maxSize;
    this.#lazy = !!lazy;
    this.ready = this.#startup();
  }

  private async _createConnection(): Promise<Connection> {
    const connection = new Connection(this.#connectionParams);
    await connection.startup();
    return connection;
  }

  /** pool max size */
  get maxSize(): number {
    return this.#maxSize;
  }

  /** number of connections created */
  get size(): number {
    if (this.#availableConnections == null) {
      return 0;
    }
    return this.#availableConnections.size;
  }

  /** number of available connections */
  get available(): number {
    if (this.#availableConnections == null) {
      return 0;
    }
    return this.#availableConnections.available;
  }

  #startup = async (): Promise<void> => {
    const initSize = this.#lazy ? 1 : this.#maxSize;
    const connecting = [...Array(initSize)].map(async () =>
      await this._createConnection()
    );
    this.#connections = await Promise.all(connecting);
    this.#availableConnections = new DeferredStack(
      this.#maxSize,
      this.#connections,
      this._createConnection.bind(this),
    );
  };

  async connect(): Promise<PoolClient> {
    await this.ready;
    const connection = await this.#availableConnections.pop();
    const release = () => this.#availableConnections.push(connection);
    return new PoolClient(connection, release);
  }

  async end(): Promise<void> {
    await this.ready;
    while (this.available > 0) {
      const conn = await this.#availableConnections.pop();
      await conn.end();
    }
  }
}
