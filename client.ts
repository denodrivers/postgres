import { Connection } from "./connection/connection.ts";
import {
  type ClientConfiguration,
  type ClientOptions,
  type ConnectionString,
  createParams,
} from "./connection/connection_params.ts";
import {
  Query,
  type QueryArguments,
  type QueryArrayResult,
  type QueryObjectOptions,
  type QueryObjectResult,
  type QueryOptions,
  type QueryResult,
  ResultType,
  templateStringToQuery,
} from "./query/query.ts";
import { Transaction, type TransactionOptions } from "./query/transaction.ts";
import { isTemplateString } from "./utils/utils.ts";

/**
 * The Session representing the current state of the connection
 */
export interface Session {
  /**
   * This is the code for the transaction currently locking the connection.
   * If there is no transaction ongoing, the transaction code will be null
   */
  current_transaction: string | null;
  /**
   * This is the process id of the current session as assigned by the database
   * on connection. This id will undefined when there is no connection stablished
   */
  pid: number | undefined;
  /**
   * Indicates if the connection is being carried over TLS. It will be undefined when
   * there is no connection stablished
   */
  tls: boolean | undefined;
  /**
   * This indicates the protocol used to connect to the database
   *
   * The two supported transports are TCP and Unix sockets
   */
  transport: "tcp" | "socket" | undefined;
}

/**
 * An abstract class used to define common database client properties and methods
 */
export abstract class QueryClient {
  #connection: Connection;
  #terminated = false;
  #transaction: string | null = null;

  /**
   * Create a new query client
   */
  constructor(connection: Connection) {
    this.#connection = connection;
  }

  /**
   * Indicates if the client is currently connected to the database
   */
  get connected(): boolean {
    return this.#connection.connected;
  }

  /**
   * The current session metadata
   */
  get session(): Session {
    return {
      current_transaction: this.#transaction,
      pid: this.#connection.pid,
      tls: this.#connection.tls,
      transport: this.#connection.transport,
    };
  }

  #assertOpenConnection() {
    if (this.#terminated) {
      throw new Error("Connection to the database has been terminated");
    }
  }

  /**
   * Close the connection to the database
   */
  protected async closeConnection() {
    if (this.connected) {
      await this.#connection.end();
    }

    this.resetSessionMetadata();
  }

  /**
   * Transactions are a powerful feature that guarantees safe operations by allowing you to control
   * the outcome of a series of statements and undo, reset, and step back said operations to
   * your liking
   *
   * In order to create a transaction, use the `createTransaction` method in your client as follows:
   *
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const client = new Client();
   * const transaction = client.createTransaction("my_transaction_name");
   *
   * await transaction.begin();
   * // All statements between begin and commit will happen inside the transaction
   * await transaction.commit(); // All changes are saved
   * await client.end();
   * ```
   *
   * All statements that fail in query execution will cause the current transaction to abort and release
   * the client without applying any of the changes that took place inside it
   *
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const client = new Client();
   * const transaction = client.createTransaction("cool_transaction");
   *
   * await transaction.begin();
   *
   * try {
   *   try {
   *     await transaction.queryArray`SELECT []`; // Invalid syntax, transaction aborted, changes won't be applied
   *   } catch (e) {
   *     await transaction.commit(); // Will throw, current transaction has already finished
   *   }
   * } catch (e) {
   *   console.log(e);
   * }
   *
   * await client.end();
   * ```
   *
   * This however, only happens if the error is of execution in nature, validation errors won't abort
   * the transaction
   *
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const client = new Client();
   * const transaction = client.createTransaction("awesome_transaction");
   *
   * await transaction.begin();
   *
   * try {
   *   await transaction.rollback("unexistent_savepoint"); // Validation error
   * } catch (e) {
   *   console.log(e);
   *   await transaction.commit(); // Transaction will end, changes will be saved
   * }
   *
   * await client.end();
   * ```
   *
   * A transaction has many options to ensure modifications made to the database are safe and
   * have the expected outcome, which is a hard thing to accomplish in a database with many concurrent users,
   * and it does so by allowing you to set local levels of isolation to the transaction you are about to begin
   *
   * Each transaction can execute with the following levels of isolation:
   *
   * - Read committed: This is the normal behavior of a transaction. External changes to the database
   *   will be visible inside the transaction once they are committed.
   *
   * - Repeatable read: This isolates the transaction in a way that any external changes to the data we are reading
   *   won't be visible inside the transaction until it has finished
   *   ```ts
   *   import { Client } from "jsr:@db/postgres";
   *   const client = new Client();
   *   const transaction = await client.createTransaction("my_transaction", { isolation_level: "repeatable_read" });
   *   ```
   *
   * - Serializable: This isolation level prevents the current transaction from making persistent changes
   *   if the data they were reading at the beginning of the transaction has been modified (recommended)
   *   ```ts
   *   import { Client } from "jsr:@db/postgres";
   *   const client = new Client();
   *   const transaction = await client.createTransaction("my_transaction", { isolation_level: "serializable" });
   *   ```
   *
   * Additionally, each transaction allows you to set two levels of access to the data:
   *
   * - Read write: This is the default mode, it allows you to execute all commands you have access to normally
   *
   * - Read only: Disables all commands that can make changes to the database. Main use for the read only mode
   *   is to in conjuction with the repeatable read isolation, ensuring the data you are reading does not change
   *   during the transaction, specially useful for data extraction
   *   ```ts
   *   import { Client } from "jsr:@db/postgres";
   *   const client = new Client();
   *   const transaction = await client.createTransaction("my_transaction", { read_only: true });
   *   ```
   *
   * Last but not least, transactions allow you to share starting point snapshots between them.
   * For example, if you initialized a repeatable read transaction before a particularly sensible change
   * in the database, and you would like to start several transactions with that same before the change state
   * you can do the following:
   *
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const client_1 = new Client();
   * const client_2 = new Client();
   * const transaction_1 = client_1.createTransaction("transaction_1");
   *
   * await transaction_1.begin();
   *
   * const snapshot = await transaction_1.getSnapshot();
   * const transaction_2 = client_2.createTransaction("new_transaction", { isolation_level: "repeatable_read", snapshot });
   * // transaction_2 now shares the same starting state that transaction_1 had
   *
   * await client_1.end();
   * await client_2.end();
   * ```
   *
   * https://www.postgresql.org/docs/14/tutorial-transactions.html
   * https://www.postgresql.org/docs/14/sql-set-transaction.html
   */
  createTransaction(name: string, options?: TransactionOptions): Transaction {
    if (!name) {
      throw new Error("Transaction name must be a non-empty string");
    }

    this.#assertOpenConnection();

    return new Transaction(
      name,
      options,
      this,
      // Bind context so function can be passed as is
      this.#executeQuery.bind(this),
      (name: string | null) => {
        this.#transaction = name;
      },
    );
  }

  /**
   * Every client must initialize their connection previously to the
   * execution of any statement
   */
  async connect(): Promise<void> {
    if (!this.connected) {
      await this.#connection.startup(false);
      this.#terminated = false;
    }
  }

  /**
   * Closing your PostgreSQL connection will delete all non-persistent data
   * that may have been created in the course of the session and will require
   * you to reconnect in order to execute further queries
   */
  async end(): Promise<void> {
    await this.closeConnection();

    this.#terminated = true;
  }

  async #executeQuery<T extends Array<unknown>>(
    _query: Query<ResultType.ARRAY>,
  ): Promise<QueryArrayResult<T>>;
  async #executeQuery<T>(
    _query: Query<ResultType.OBJECT>,
  ): Promise<QueryObjectResult<T>>;
  async #executeQuery(query: Query<ResultType>): Promise<QueryResult> {
    return await this.#connection.query(query);
  }

  /**
   * Execute queries and retrieve the data as array entries. It supports a generic in order to type the entries retrieved by the query
   *
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const my_client = new Client();
   *
   * await my_client.queryArray`CREATE TABLE IF NOT EXISTS CLIENTS (
   *   id SERIAL PRIMARY KEY,
   *   name TEXT NOT NULL
   * )`
   *
   * const { rows: rows1 } = await my_client.queryArray(
   *   "SELECT ID, NAME FROM CLIENTS"
   * ); // Array<unknown[]>
   *
   * const { rows: rows2 } = await my_client.queryArray<[number, string]>(
   *   "SELECT ID, NAME FROM CLIENTS"
   * ); // Array<[number, string]>
   *
   * await my_client.end();
   * ```
   */
  async queryArray<T extends Array<unknown>>(
    query: string,
    args?: QueryArguments,
  ): Promise<QueryArrayResult<T>>;
  /**
   * Use the configuration object for more advance options to execute the query
   *
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const my_client = new Client();
   * const { rows } = await my_client.queryArray<[number, string]>({
   *   text: "SELECT ID, NAME FROM CLIENTS",
   *   name: "select_clients",
   * }); // Array<[number, string]>
   * await my_client.end();
   * ```
   */
  async queryArray<T extends Array<unknown>>(
    config: QueryOptions,
  ): Promise<QueryArrayResult<T>>;
  /**
   * Execute prepared statements with template strings
   *
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const my_client = new Client();
   *
   * const id = 12;
   * // Array<[number, string]>
   * const {rows} = await my_client.queryArray<[number, string]>`SELECT ID, NAME FROM CLIENTS WHERE ID = ${id}`;
   *
   * await my_client.end();
   * ```
   */
  async queryArray<T extends Array<unknown>>(
    strings: TemplateStringsArray,
    ...args: unknown[]
  ): Promise<QueryArrayResult<T>>;
  async queryArray<T extends Array<unknown> = Array<unknown>>(
    query_template_or_config: TemplateStringsArray | string | QueryOptions,
    ...args: unknown[] | [QueryArguments | undefined]
  ): Promise<QueryArrayResult<T>> {
    this.#assertOpenConnection();

    if (this.#transaction !== null) {
      throw new Error(
        `This connection is currently locked by the "${this.#transaction}" transaction`,
      );
    }

    let query: Query<ResultType.ARRAY>;
    if (typeof query_template_or_config === "string") {
      query = new Query(
        query_template_or_config,
        ResultType.ARRAY,
        args[0] as QueryArguments | undefined,
      );
    } else if (isTemplateString(query_template_or_config)) {
      query = templateStringToQuery(
        query_template_or_config,
        args,
        ResultType.ARRAY,
      );
    } else {
      query = new Query(query_template_or_config, ResultType.ARRAY);
    }

    return await this.#executeQuery(query);
  }

  /**
   * Executed queries and retrieve the data as object entries. It supports a generic in order to type the entries retrieved by the query
   *
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const my_client = new Client();
   *
   * const { rows: rows1 } = await my_client.queryObject(
   *   "SELECT ID, NAME FROM CLIENTS"
   * ); // Record<string, unknown>
   *
   * const { rows: rows2 } = await my_client.queryObject<{id: number, name: string}>(
   *   "SELECT ID, NAME FROM CLIENTS"
   * ); // Array<{id: number, name: string}>
   *
   * await my_client.end();
   * ```
   */
  async queryObject<T>(
    query: string,
    args?: QueryArguments,
  ): Promise<QueryObjectResult<T>>;
  /**
   * Use the configuration object for more advance options to execute the query
   *
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const my_client = new Client();
   *
   * const { rows: rows1 } = await my_client.queryObject(
   *   "SELECT ID, NAME FROM CLIENTS"
   * );
   * console.log(rows1); // [{id: 78, name: "Frank"}, {id: 15, name: "Sarah"}]
   *
   * const { rows: rows2 } = await my_client.queryObject({
   *   text: "SELECT ID, NAME FROM CLIENTS",
   *   fields: ["personal_id", "complete_name"],
   * });
   * console.log(rows2); // [{personal_id: 78, complete_name: "Frank"}, {personal_id: 15, complete_name: "Sarah"}]
   *
   * await my_client.end();
   * ```
   */
  async queryObject<T>(
    config: QueryObjectOptions,
  ): Promise<QueryObjectResult<T>>;
  /**
   * Execute prepared statements with template strings
   *
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const my_client = new Client();
   * const id = 12;
   * // Array<{id: number, name: string}>
   * const { rows } = await my_client.queryObject<{id: number, name: string}>`SELECT ID, NAME FROM CLIENTS WHERE ID = ${id}`;
   * await my_client.end();
   * ```
   */
  async queryObject<T>(
    query: TemplateStringsArray,
    ...args: unknown[]
  ): Promise<QueryObjectResult<T>>;
  async queryObject<T = Record<string, unknown>>(
    query_template_or_config:
      | string
      | QueryObjectOptions
      | TemplateStringsArray,
    ...args: unknown[] | [QueryArguments | undefined]
  ): Promise<QueryObjectResult<T>> {
    this.#assertOpenConnection();

    if (this.#transaction !== null) {
      throw new Error(
        `This connection is currently locked by the "${this.#transaction}" transaction`,
      );
    }

    let query: Query<ResultType.OBJECT>;
    if (typeof query_template_or_config === "string") {
      query = new Query(
        query_template_or_config,
        ResultType.OBJECT,
        args[0] as QueryArguments | undefined,
      );
    } else if (isTemplateString(query_template_or_config)) {
      query = templateStringToQuery(
        query_template_or_config,
        args,
        ResultType.OBJECT,
      );
    } else {
      query = new Query(
        query_template_or_config as QueryObjectOptions,
        ResultType.OBJECT,
      );
    }

    return await this.#executeQuery<T>(query);
  }

  /**
   * Resets the transaction session metadata
   */
  protected resetSessionMetadata() {
    this.#transaction = null;
  }
}

/**
 * Clients allow you to communicate with your PostgreSQL database and execute SQL
 * statements asynchronously
 *
 * ```ts
 * import { Client } from "jsr:@db/postgres";
 * const client = new Client();
 * await client.connect();
 * await client.queryArray`SELECT * FROM CLIENTS`;
 * await client.end();
 * ```
 *
 * A client will execute all their queries in a sequential fashion,
 * for concurrency capabilities check out connection pools
 *
 * ```ts
 * import { Client } from "jsr:@db/postgres";
 * const client_1 = new Client();
 * await client_1.connect();
 * // Even if operations are not awaited, they will be executed in the order they were
 * // scheduled
 * client_1.queryArray`DELETE FROM CLIENTS`;
 *
 * const client_2 = new Client();
 * await client_2.connect();
 * // `client_2` will execute it's queries in parallel to `client_1`
 * const {rows: result} = await client_2.queryArray`SELECT * FROM CLIENTS`;
 *
 * await client_1.end();
 * await client_2.end();
 * ```
 */
export class Client extends QueryClient {
  /**
   * Create a new client
   */
  constructor(config?: ClientOptions | ConnectionString) {
    super(
      new Connection(createParams(config), async () => {
        await this.closeConnection();
      }),
    );
  }
}

/**
 * A client used specifically by a connection pool
 */
export class PoolClient extends QueryClient {
  #release: () => void;

  /**
   * Create a new Client used by the pool
   */
  constructor(config: ClientConfiguration, releaseCallback: () => void) {
    super(
      new Connection(config, async () => {
        await this.closeConnection();
      }),
    );
    this.#release = releaseCallback;
  }

  /**
   * Releases the client back to the pool
   */
  release() {
    this.#release();

    // Cleanup all session related metadata
    this.resetSessionMetadata();
  }

  [Symbol.dispose]() {
    this.release();
  }
}
