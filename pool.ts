import { PoolClient } from "./client.ts";
import { Connection } from "./connection/connection.ts";
import {
  ConnectionOptions,
  ConnectionParams,
  ConnectionString,
  createParams,
} from "./connection/connection_params.ts";
import { DeferredStack } from "./connection/deferred.ts";

export class Pool {
  #available_connections: DeferredStack<Connection> | null = null;
  #lazy: boolean;
  #max_size: number;
  // TODO
  // Initialization should probably have a timeout
  #ready: Promise<void>;

  constructor(
    // deno-lint-ignore camelcase
    connection_params: ConnectionOptions | ConnectionString | undefined,
    // deno-lint-ignore camelcase
    max_size: number,
    lazy?: boolean,
  ) {
    this.#max_size = max_size;
    this.#lazy = !!lazy;
    this.#ready = this.#initialize(createParams(connection_params));
  }

  /** number of available connections */
  get available(): number {
    if (this.#available_connections == null) {
      return 0;
    }
    return this.#available_connections.available;
  }

  async connect(): Promise<PoolClient> {
    await this.#ready;
    const connection = await this.#available_connections!.pop();
    const release = () => this.#available_connections!.push(connection);
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
      const conn = await this.#available_connections!.pop();
      await conn.end();
    }
  }

  #initialize = async (params: ConnectionParams): Promise<void> => {
    const initSize = this.#lazy ? 1 : this.#max_size;
    const connections = Array.from(
      { length: initSize },
      () => this.#createConnection(params),
    );

    this.#available_connections = new DeferredStack(
      this.#max_size,
      await Promise.all(connections),
      this.#createConnection.bind(this, params),
    );
  };

  /** number of connections created */
  get size(): number {
    if (this.#available_connections == null) {
      return 0;
    }
    return this.#available_connections.size;
  }
}
