import { PoolClient } from "./client.ts";
import { Connection } from "./connection/connection.ts";
import {
  ConnectionOptions,
  ConnectionParams,
  ConnectionString,
  createParams,
} from "./connection/connection_params.ts";
import { DeferredStack } from "./connection/deferred.ts";

// TODO
// Remove query execution methods from main pool
export class Pool {
  #availableConnections: DeferredStack<Connection> | null = null;
  #lazy: boolean;
  #maxSize: number;
  // TODO
  // Initialization should probably have a timeout
  #ready: Promise<void>;

  constructor(
    connectionParams: ConnectionOptions | ConnectionString | undefined,
    maxSize: number,
    lazy?: boolean,
  ) {
    this.#maxSize = maxSize;
    this.#lazy = !!lazy;
    this.#ready = this.#initialize(createParams(connectionParams));
  }

  /** number of available connections */
  get available(): number {
    if (this.#availableConnections == null) {
      return 0;
    }
    return this.#availableConnections.available;
  }

  async connect(): Promise<PoolClient> {
    await this.#ready;
    const connection = await this.#availableConnections!.pop();
    const release = () => this.#availableConnections!.push(connection);
    return new PoolClient(connection, release);
  }

  #createConnection = async (params: ConnectionParams): Promise<Connection> => {
    const connection = new Connection(params);
    await connection.startup();
    return connection;
  };

  async end(): Promise<void> {
    await this.#ready;
    while (this.available > 0) {
      const conn = await this.#availableConnections!.pop();
      await conn.end();
    }
  }

  #initialize = async (params: ConnectionParams): Promise<void> => {
    const initSize = this.#lazy ? 1 : this.#maxSize;
    const connections = [...Array(initSize)].map(() =>
      this.#createConnection(params)
    );

    this.#availableConnections = new DeferredStack(
      this.#maxSize,
      await Promise.all(connections),
      this.#createConnection.bind(this, params),
    );
  };

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
}
