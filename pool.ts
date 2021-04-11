import { PoolClient } from "./client.ts";
import { Connection } from "./connection/connection.ts";
import {
  ConnectionOptions,
  ConnectionParams,
  ConnectionString,
  createParams,
} from "./connection/connection_params.ts";
import { DeferredStack } from "./connection/deferred.ts";

/**
 * Connection pools are a powerful resource to execute parallel queries and
 * save up time in connection initialization. It is highly recommended that all
 * applications that require concurrent access use a pool to communicate
 * with their PostgreSQL database
 * 
 * ```ts
 * const pool = new Pool({
 *   database: "database",
 *   hostname: "hostname",
 *   password: "password",
 *   port: 5432,
 *   user: "user",
 * }, 10); // Creates a pool with 10 available connections
 * 
 * const client = await pool.connect();
 * await client.queryArray`SELECT 1`;
 * await client.release();
 * ```
 * 
 * You can also opt to not initialize all your connections at once by passing the `lazy`
 * option when instantiating your pool, this is useful to reduce startup time. In
 * addition to this, the pool won't start the connection unless there isn't any already
 * available connections in the pool
 * 
 * ```ts
 * // Creates a pool with 10 max available connections
 * // Connection with the database won't be established until the user requires it
 * const pool = new Pool(connection_params, 10, true);
 * 
 * // Connection is created here, will be available from now on
 * const client_1 = await pool.connect();
 * await client_1.queryArray`SELECT 1`;
 * await client_1.release();
 * 
 * // Same connection as before, will be reused instead of starting a new one
 * const client_2 = await pool.connect();
 * await client_2.queryArray`SELECT 1`;
 * 
 * // New connection, since previous one is still in use
 * // There will be two open connections available from now on
 * const client_3 = await pool.connect();
 * await client_2.release();
 * await client_3.release();
 * ```
 */
export class Pool {
  #available_connections: DeferredStack<Connection> | null = null;
  #connection_params: ConnectionParams;
  #ended = false;
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
    lazy: boolean = false,
  ) {
    this.#connection_params = createParams(connection_params);
    this.#lazy = lazy;
    this.#max_size = max_size;
    this.#ready = this.#initialize();
  }

  /**
   * The number of open connections available for use
   * 
   * Lazily initialized pools won't have any open connections by default
   */
  get available(): number {
    if (this.#available_connections == null) {
      return 0;
    }
    return this.#available_connections.available;
  }

  /**
   * This will return a new client from the available connections in
   * the pool
   * 
   * In the case of lazy initialized pools, a new connection will be established
   * with the database if no other connections are available
   * 
   * ```ts
   * const client = pool.connect();
   * await client.queryArray`UPDATE MY_TABLE SET X = 1`;
   * await client.release();
   * ```
   */
  async connect(): Promise<PoolClient> {
    // Reinitialize pool if it has been terminated
    if (this.#ended) {
      this.#ready = this.#initialize();
    }

    await this.#ready;
    const connection = await this.#available_connections!.pop();
    const release = () => this.#available_connections!.push(connection);
    return new PoolClient(connection, release);
  }

  #createConnection = async (): Promise<Connection> => {
    const connection = new Connection(this.#connection_params);
    await connection.startup();
    return connection;
  };

  /**
   * This will close all open connections and set a terminated status in the pool
   * 
   * ```ts
   * await pool.end();
   * assertEquals(pool.available, 0);
   * await pool.end(); // An exception will be thrown, pool doesn't have any connections to close
   * ```
   * 
   * However, a terminated pool can be reused by using the "connect" method, which
   * will reinitialize the connections according to the original configuration of the pool
   * 
   * ```ts
   * await pool.end();
   * const client = await pool.connect();
   * await client.queryArray`SELECT 1`; // Works!
   * await client.close();
   * ```
   */
  async end(): Promise<void> {
    if (this.#ended) {
      throw new Error("Pool connections have already been terminated");
    }

    await this.#ready;
    while (this.available > 0) {
      const conn = await this.#available_connections!.pop();
      await conn.end();
    }

    this.#available_connections = null;
    this.#ended = true;
  }

  #initialize = async (): Promise<void> => {
    const initSize = this.#lazy ? 0 : this.#max_size;
    const connections = Array.from(
      { length: initSize },
      () => this.#createConnection(),
    );

    this.#available_connections = new DeferredStack(
      this.#max_size,
      await Promise.all(connections),
      this.#createConnection.bind(this),
    );

    this.#ended = false;
  };

  /**
   * The number of total connections open in the pool
   * 
   * Both available and in use connections will be counted
   */
  get size(): number {
    if (this.#available_connections == null) {
      return 0;
    }
    return this.#available_connections.size;
  }
}
