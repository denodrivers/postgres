import { PoolClient } from "./client.ts";
import {
  type ClientConfiguration,
  type ClientOptions,
  type ConnectionString,
  createParams,
} from "./connection/connection_params.ts";
import { DeferredAccessStack } from "./utils/deferred.ts";

/**
 * Connection pools are a powerful resource to execute parallel queries and
 * save up time in connection initialization. It is highly recommended that all
 * applications that require concurrent access use a pool to communicate
 * with their PostgreSQL database
 *
 * ```ts
 * import { Pool } from "./pool.ts";
 *
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
 * client.release();
 * ```
 *
 * You can also opt to not initialize all your connections at once by passing the `lazy`
 * option when instantiating your pool, this is useful to reduce startup time. In
 * addition to this, the pool won't start the connection unless there isn't any already
 * available connections in the pool
 *
 * ```ts
 * import { Pool } from "./pool.ts";
 *
 * // Creates a pool with 10 max available connections
 * // Connection with the database won't be established until the user requires it
 * const pool = new Pool({}, 10, true);
 *
 * // Connection is created here, will be available from now on
 * const client_1 = await pool.connect();
 * await client_1.queryArray`SELECT 1`;
 * client_1.release();
 *
 * // Same connection as before, will be reused instead of starting a new one
 * const client_2 = await pool.connect();
 * await client_2.queryArray`SELECT 1`;
 *
 * // New connection, since previous one is still in use
 * // There will be two open connections available from now on
 * const client_3 = await pool.connect();
 * client_2.release();
 * client_3.release();
 * ```
 */
export class Pool {
  #available_connections?: DeferredAccessStack<PoolClient>;
  #connection_params: ClientConfiguration;
  #ended = false;
  #lazy: boolean;
  // TODO
  // Initialization should probably have a timeout
  #ready: Promise<void>;
  #size: number;

  /**
   * The number of open connections available for use
   *
   * Lazily initialized pools won't have any open connections by default
   */
  get available(): number {
    if (!this.#available_connections) {
      return 0;
    }
    return this.#available_connections.available;
  }

  /**
   * The number of total connections open in the pool
   *
   * Both available and in use connections will be counted
   */
  get size(): number {
    if (!this.#available_connections) {
      return 0;
    }
    return this.#available_connections.size;
  }

  constructor(
    connection_params: ClientOptions | ConnectionString | undefined,
    size: number,
    lazy: boolean = false,
  ) {
    this.#connection_params = createParams(connection_params);
    this.#lazy = lazy;
    this.#size = size;

    // This must ALWAYS be called the last
    this.#ready = this.#initialize();
  }

  // TODO
  // Rename to getClient or similar
  // The connect method should initialize the connections instead of doing it
  // in the constructor
  /**
   * This will return a new client from the available connections in
   * the pool
   *
   * In the case of lazy initialized pools, a new connection will be established
   * with the database if no other connections are available
   *
   * ```ts
   * import { Pool } from "./pool.ts";
   *
   * const pool = new Pool({}, 10);
   * const client = await pool.connect();
   * await client.queryArray`UPDATE MY_TABLE SET X = 1`;
   * client.release();
   * ```
   */
  async connect(): Promise<PoolClient> {
    // Reinitialize pool if it has been terminated
    if (this.#ended) {
      this.#ready = this.#initialize();
    }

    await this.#ready;
    return this.#available_connections!.pop();
  }

  /**
   * This will close all open connections and set a terminated status in the pool
   *
   * ```ts
   * import { Pool } from "./pool.ts";
   *
   * const pool = new Pool({}, 10);
   *
   * await pool.end();
   * console.assert(pool.available === 0, "There are connections available after ending the pool");
   * await pool.end(); // An exception will be thrown, pool doesn't have any connections to close
   * ```
   *
   * However, a terminated pool can be reused by using the "connect" method, which
   * will reinitialize the connections according to the original configuration of the pool
   *
   * ```ts
   * import { Pool } from "./pool.ts";
   *
   * const pool = new Pool({}, 10);
   * await pool.end();
   * const client = await pool.connect();
   * await client.queryArray`SELECT 1`; // Works!
   * client.release();
   * ```
   */
  async end(): Promise<void> {
    if (this.#ended) {
      throw new Error("Pool connections have already been terminated");
    }

    await this.#ready;
    while (this.available > 0) {
      const client = await this.#available_connections!.pop();
      await client.end();
    }

    this.#available_connections = undefined;
    this.#ended = true;
  }

  /**
   * Initialization will create all pool clients instances by default
   *
   * If the pool is lazily initialized, the clients will connect when they
   * are requested by the user, otherwise they will all connect on initialization
   */
  async #initialize() {
    const initialized = this.#lazy ? 0 : this.#size;
    const clients = Array.from(
      { length: this.#size },
      async (_e, index) => {
        const client: PoolClient = new PoolClient(
          this.#connection_params,
          () => this.#available_connections!.push(client),
        );

        if (index < initialized) {
          await client.connect();
        }

        return client;
      },
    );

    this.#available_connections = new DeferredAccessStack(
      await Promise.all(clients),
      (client) => client.connect(),
      (client) => client.connected,
    );

    this.#ended = false;
  } /**
   * This will return the number of initialized clients in the pool
   */

  async initialized(): Promise<number> {
    if (!this.#available_connections) {
      return 0;
    }

    return await this.#available_connections.initialized();
  }
}
