import type { QueryClient } from "../client.ts";
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
} from "./query.ts";
import { isTemplateString } from "../utils/utils.ts";
import { PostgresError, TransactionError } from "../client/error.ts";

/** The isolation level of a transaction to control how we determine the data integrity between transactions */
export type IsolationLevel =
  | "read_committed"
  | "repeatable_read"
  | "serializable";

/** Type of the transaction options */
export type TransactionOptions = {
  isolation_level?: IsolationLevel;
  read_only?: boolean;
  snapshot?: string;
};

/**
 * A savepoint is a point in a transaction that you can roll back to
 */
export class Savepoint {
  /**
   * This is the count of the current savepoint instances in the transaction
   */
  #instance_count = 0;
  #release_callback: (name: string) => Promise<void>;
  #update_callback: (name: string) => Promise<void>;

  /**
   * Create a new savepoint with the provided name and callbacks
   */
  constructor(
    public readonly name: string,
    update_callback: (name: string) => Promise<void>,
    release_callback: (name: string) => Promise<void>,
  ) {
    this.#release_callback = release_callback;
    this.#update_callback = update_callback;
  }

  /**
   * This is the count of the current savepoint instances in the transaction
   */
  get instances(): number {
    return this.#instance_count;
  }

  /**
   * Releasing a savepoint will remove it's last instance in the transaction
   *
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * await transaction.begin();
   * const savepoint = await transaction.savepoint("n1");
   * await savepoint.release();
   *
   * try {
   *   await transaction.rollback(savepoint); // Error, can't rollback because the savepoint was released
   * } catch (e) {
   *   console.log(e);
   * }
   *
   * await client.end();
   * ```
   *
   * It will also allow you to set the savepoint to the position it had before the last update
   *
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction1");
   *
   * await transaction.begin();
   * const savepoint = await transaction.savepoint("n1");
   * await savepoint.update();
   * await savepoint.release(); // This drops the update of the last statement
   * await transaction.rollback(savepoint); // Will rollback to the first instance of the savepoint
   * await client.end();
   * ```
   *
   * This function will throw if there are no savepoint instances to drop
   */
  async release() {
    if (this.#instance_count === 0) {
      throw new Error("This savepoint has no instances to release");
    }

    await this.#release_callback(this.name);
    --this.#instance_count;
  }

  /**
   * Updating a savepoint will update its position in the transaction execution
   *
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction1");
   *
   * await transaction.begin();
   *
   * const savepoint = await transaction.savepoint("n1");
   * transaction.queryArray`DELETE FROM CLIENTS`;
   * await savepoint.update(); // Rolling back will now return you to this point on the transaction
   * await client.end();
   * ```
   *
   * You can also undo a savepoint update by using the `release` method
   *
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction1");
   *
   * await transaction.begin();
   *
   * const savepoint = await transaction.savepoint("n1");
   * transaction.queryArray`DELETE FROM CLIENTS`;
   * await savepoint.update(); // Oops, shouldn't have updated the savepoint
   * await savepoint.release(); // This will undo the last update and return the savepoint to the first instance
   * await transaction.rollback(); // Will rollback before the table was deleted
   * await client.end();
   * ```
   */
  async update() {
    await this.#update_callback(this.name);
    ++this.#instance_count;
  }
}

/**
 * A transaction class
 *
 * Transactions are a powerful feature that guarantees safe operations by allowing you to control
 * the outcome of a series of statements and undo, reset, and step back said operations to
 * your liking
 */
export class Transaction {
  #client: QueryClient;
  #executeQuery: (query: Query<ResultType>) => Promise<QueryResult>;
  /** The isolation level of the transaction */
  #isolation_level: IsolationLevel;
  #read_only: boolean;
  /** The transaction savepoints */
  #savepoints: Savepoint[] = [];
  #snapshot?: string;
  #updateClientLock: (name: string | null) => void;

  /**
   * Create a new transaction with the provided name and options
   */
  constructor(
    public name: string,
    options: TransactionOptions | undefined,
    client: QueryClient,
    execute_query_callback: (query: Query<ResultType>) => Promise<QueryResult>,
    update_client_lock_callback: (name: string | null) => void,
  ) {
    this.#client = client;
    this.#executeQuery = execute_query_callback;
    this.#isolation_level = options?.isolation_level ?? "read_committed";
    this.#read_only = options?.read_only ?? false;
    this.#snapshot = options?.snapshot;
    this.#updateClientLock = update_client_lock_callback;
  }

  /**
   * Get the isolation level of the transaction
   */
  get isolation_level(): IsolationLevel {
    return this.#isolation_level;
  }

  /**
   * Get all the savepoints of the transaction
   */
  get savepoints(): Savepoint[] {
    return this.#savepoints;
  }

  /**
   * This method will throw if the transaction opened in the client doesn't match this one
   */
  #assertTransactionOpen() {
    if (this.#client.session.current_transaction !== this.name) {
      throw new Error(
        'This transaction has not been started yet, make sure to use the "begin" method to do so',
      );
    }
  }

  #resetTransaction() {
    this.#savepoints = [];
  }

  /**
   * The begin method will officially begin the transaction, and it must be called before
   * any query or transaction operation is executed in order to lock the session
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction_name");
   *
   * await transaction.begin(); // Session is locked, transaction operations are now safe
   * // Important operations
   * await transaction.commit(); // Session is unlocked, external operations can now take place
   * await client.end();
   * ```
   * https://www.postgresql.org/docs/14/sql-begin.html
   */
  async begin() {
    if (this.#client.session.current_transaction !== null) {
      if (this.#client.session.current_transaction === this.name) {
        throw new Error("This transaction is already open");
      }

      throw new Error(
        `This client already has an ongoing transaction "${this.#client.session.current_transaction}"`,
      );
    }

    let isolation_level;
    switch (this.#isolation_level) {
      case "read_committed": {
        isolation_level = "READ COMMITTED";
        break;
      }
      case "repeatable_read": {
        isolation_level = "REPEATABLE READ";
        break;
      }
      case "serializable": {
        isolation_level = "SERIALIZABLE";
        break;
      }
      default:
        throw new Error(
          `Unexpected isolation level "${this.#isolation_level}"`,
        );
    }

    let permissions;
    if (this.#read_only) {
      permissions = "READ ONLY";
    } else {
      permissions = "READ WRITE";
    }

    let snapshot = "";
    if (this.#snapshot) {
      snapshot = `SET TRANSACTION SNAPSHOT '${this.#snapshot}'`;
    }

    try {
      await this.#client.queryArray(
        `BEGIN ${permissions} ISOLATION LEVEL ${isolation_level};${snapshot}`,
      );
    } catch (e) {
      if (e instanceof PostgresError) {
        throw new TransactionError(this.name, e);
      }
      throw e;
    }

    this.#updateClientLock(this.name);
  }

  /** Should not commit the same transaction twice. */
  #committed = false;

  /**
   * The commit method will make permanent all changes made to the database in the
   * current transaction and end the current transaction
   *
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * await transaction.begin();
   * // Important operations
   * await transaction.commit(); // Will terminate the transaction and save all changes
   * await client.end();
   * ```
   *
   * The commit method allows you to specify a "chain" option, that allows you to both commit the current changes and
   * start a new with the same transaction parameters in a single statement
   *
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction1");
   *
   * await transaction.begin();
   *
   * // Transaction operations I want to commit
   * await transaction.commit({ chain: true }); // All changes are saved, following statements will be executed inside a transaction
   * await transaction.queryArray`DELETE FROM CLIENTS`; // Still inside the transaction
   * await transaction.commit(); // The transaction finishes for good
   * await client.end();
   * ```
   *
   * https://www.postgresql.org/docs/14/sql-commit.html
   */
  async commit(options?: { chain?: boolean }) {
    this.#assertTransactionOpen();

    const chain = options?.chain ?? false;

    if (!this.#committed) {
      try {
        await this.queryArray(`COMMIT ${chain ? "AND CHAIN" : ""}`);
        if (!chain) {
          this.#committed = true;
        }
      } catch (e) {
        if (e instanceof PostgresError) {
          throw new TransactionError(this.name, e);
        }
        throw e;
      }
    }

    this.#resetTransaction();
    if (!chain) {
      this.#updateClientLock(null);
    }
  }

  /**
   * This method will search for the provided savepoint name and return a
   * reference to the requested savepoint, otherwise it will return undefined
   */
  getSavepoint(name: string): Savepoint | undefined {
    return this.#savepoints.find((sv) => sv.name === name.toLowerCase());
  }

  /**
   * This method will list you all of the active savepoints in this transaction
   */
  getSavepoints(): string[] {
    return this.#savepoints
      .filter(({ instances }) => instances > 0)
      .map(({ name }) => name);
  }

  /**
   * This method returns the snapshot id of the on going transaction, allowing you to share
   * the snapshot state between two transactions
   *
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const client_1 = new Client();
   * const client_2 = new Client();
   * const transaction_1 = client_1.createTransaction("transaction");
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
   * https://www.postgresql.org/docs/14/functions-admin.html#FUNCTIONS-SNAPSHOT-SYNCHRONIZATION
   */
  async getSnapshot(): Promise<string> {
    this.#assertTransactionOpen();

    const { rows } = await this.queryObject<{
      snapshot: string;
    }>`SELECT PG_EXPORT_SNAPSHOT() AS SNAPSHOT;`;
    return rows[0].snapshot;
  }

  /**
   * This method allows executed queries to be retrieved as array entries.
   * It supports a generic interface in order to type the entries retrieved by the query
   *
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * await transaction.begin();
   *
   * const {rows} = await transaction.queryArray(
   *  "SELECT ID, NAME FROM CLIENTS"
   * ); // Array<unknown[]>
   *
   * await client.end();
   * ```
   *
   * You can pass type arguments to the query in order to hint TypeScript what the return value will be
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * await transaction.begin();
   *
   * const { rows } = await transaction.queryArray<[number, string]>(
   *  "SELECT ID, NAME FROM CLIENTS"
   * ); // Array<[number, string]>
   *
   * await client.end();
   * ```
   *
   * It also allows you to execute prepared stamements with template strings
   *
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * await transaction.begin();
   *
   * const id = 12;
   * // Array<[number, string]>
   * const { rows } = await transaction.queryArray<[number, string]>`SELECT ID, NAME FROM CLIENTS WHERE ID = ${id}`;
   *
   * await client.end();
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
    this.#assertTransactionOpen();

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

    try {
      return (await this.#executeQuery(query)) as QueryArrayResult<T>;
    } catch (e) {
      if (e instanceof PostgresError) {
        await this.commit();
        throw new TransactionError(this.name, e);
      }
      throw e;
    }
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
    this.#assertTransactionOpen();

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

    try {
      return (await this.#executeQuery(query)) as QueryObjectResult<T>;
    } catch (e) {
      if (e instanceof PostgresError) {
        await this.commit();
        throw new TransactionError(this.name, e);
      }
      throw e;
    }
  }

  /**
   * Rollbacks are a mechanism to undo transaction operations without compromising the data that was modified during
   * the transaction.
   *
   * Calling a rollback without arguments will terminate the current transaction and undo all changes.
   *
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * await transaction.begin();
   *
   * // Very very important operations that went very, very wrong
   * await transaction.rollback(); // Like nothing ever happened
   * await client.end();
   * ```
   *
   * https://www.postgresql.org/docs/14/sql-rollback.html
   */
  async rollback(): Promise<void>;
  /**
   * Savepoints can be used to rollback specific changes part of a transaction.
   *
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction1");
   *
   * await transaction.begin();
   *
   * // Important operations I don't want to rollback
   * const savepoint = await transaction.savepoint("before_disaster");
   * await transaction.queryArray`DELETE FROM CLIENTS`; // Oops, deleted the wrong thing
   *
   * // These are all the same, everything that happened between the savepoint and the rollback gets undone
   * await transaction.rollback(savepoint);
   * await transaction.rollback('before_disaster')
   * await transaction.rollback({ savepoint: 'before_disaster'})
   *
   * await transaction.commit(); // Commits all other changes
   * await client.end();
   * ```
   */
  async rollback(
    savepoint?: string | Savepoint | { savepoint?: string | Savepoint },
  ): Promise<void>;
  /**
   * The `chain` option allows you to undo the current transaction and restart it with the same parameters in a single statement
   *
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction2");
   *
   * await transaction.begin();
   *
   * // Transaction operations I want to undo
   * await transaction.rollback({ chain: true }); // All changes are undone, but the following statements will be executed inside a transaction as well
   * await transaction.queryArray`DELETE FROM CLIENTS`; // Still inside the transaction
   * await transaction.commit(); // The transaction finishes for good
   * await client.end();
   * ```
   */
  async rollback(options?: { chain?: boolean }): Promise<void>;
  async rollback(
    /**
     * The "chain" and "savepoint" options can't be used alongside each other, even though they are similar. A savepoint is meant to reset progress up to a certain point, while a chained rollback is meant to reset all progress
     * and start from scratch
     */
    savepoint_or_options?:
      | string
      | Savepoint
      | {
        savepoint?: string | Savepoint;
      }
      | { chain?: boolean },
  ): Promise<void> {
    this.#assertTransactionOpen();

    let savepoint_option: Savepoint | string | undefined;
    if (
      typeof savepoint_or_options === "string" ||
      savepoint_or_options instanceof Savepoint
    ) {
      savepoint_option = savepoint_or_options;
    } else {
      savepoint_option = (
        savepoint_or_options as { savepoint?: string | Savepoint }
      )?.savepoint;
    }

    let savepoint_name: string | undefined;
    if (savepoint_option instanceof Savepoint) {
      savepoint_name = savepoint_option.name;
    } else if (typeof savepoint_option === "string") {
      savepoint_name = savepoint_option.toLowerCase();
    }

    let chain_option = false;
    if (typeof savepoint_or_options === "object") {
      chain_option = (savepoint_or_options as { chain?: boolean })?.chain ??
        false;
    }

    if (chain_option && savepoint_name) {
      throw new Error(
        "The chain option can't be used alongside a savepoint on a rollback operation",
      );
    }

    // If a savepoint is provided, rollback to that savepoint, continue the transaction
    if (typeof savepoint_option !== "undefined") {
      const ts_savepoint = this.#savepoints.find(
        ({ name }) => name === savepoint_name,
      );
      if (!ts_savepoint) {
        throw new Error(
          `There is no "${savepoint_name}" savepoint registered in this transaction`,
        );
      }
      if (!ts_savepoint.instances) {
        throw new Error(
          `There are no savepoints of "${savepoint_name}" left to rollback to`,
        );
      }

      await this.queryArray(`ROLLBACK TO ${savepoint_name}`);
      return;
    }

    // If no savepoint is provided, rollback the whole transaction and check for the chain operator
    // in order to decide whether to restart the transaction or end it
    try {
      await this.queryArray(`ROLLBACK ${chain_option ? "AND CHAIN" : ""}`);
    } catch (e) {
      if (e instanceof PostgresError) {
        await this.commit();
        throw new TransactionError(this.name, e);
      }
      throw e;
    }

    this.#resetTransaction();
    if (!chain_option) {
      this.#updateClientLock(null);
    }
  }

  /**
   * This method will generate a savepoint, which will allow you to reset transaction states
   * to a previous point of time
   *
   * Each savepoint has a unique name used to identify it, and it must abide the following rules
   *
   * - Savepoint names must start with a letter or an underscore
   * - Savepoint names are case insensitive
   * - Savepoint names can't be longer than 63 characters
   * - Savepoint names can only have alphanumeric characters
   *
   * A savepoint can be easily created like this
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * await transaction.begin();
   *
   * const savepoint = await transaction.savepoint("MY_savepoint"); // returns a `Savepoint` with name "my_savepoint"
   * await transaction.rollback(savepoint);
   * await savepoint.release(); // The savepoint will be removed
   * await client.end();
   * ```
   * All savepoints can have multiple positions in a transaction, and you can change or update
   * this positions by using the `update` and `release` methods
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction1");
   *
   * await transaction.begin();
   *
   * const savepoint = await transaction.savepoint("n1");
   * await transaction.queryArray`DELETE FROM CLIENTS`;
   * await savepoint.update(); // The savepoint will continue from here
   * await transaction.queryArray`DELETE FROM CLIENTS`;
   * await transaction.rollback(savepoint); // The transaction will rollback before the secpmd delete
   * await savepoint.release(); // The last savepoint will be removed, the original one will remain
   * await transaction.rollback(savepoint); // It rolls back before the delete
   * await savepoint.release(); // All savepoints are released
   * await client.end();
   * ```
   *
   * Creating a new savepoint with an already used name will return you a reference to
   * the original savepoint
   * ```ts
   * import { Client } from "jsr:@db/postgres";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction2");
   *
   * await transaction.begin();
   *
   * const savepoint_a = await transaction.savepoint("a");
   * await transaction.queryArray`DELETE FROM CLIENTS`;
   * const savepoint_b = await transaction.savepoint("a"); // They will be the same savepoint, but the savepoint will be updated to this position
   * await transaction.rollback(savepoint_a); // Rolls back to savepoint_b
   * await client.end();
   * ```
   * https://www.postgresql.org/docs/14/sql-savepoint.html
   */
  async savepoint(name: string): Promise<Savepoint> {
    this.#assertTransactionOpen();

    if (!/^[a-zA-Z_]{1}[\w]{0,62}$/.test(name)) {
      if (!Number.isNaN(Number(name[0]))) {
        throw new Error("The savepoint name can't begin with a number");
      }
      if (name.length > 63) {
        throw new Error(
          "The savepoint name can't be longer than 63 characters",
        );
      }
      throw new Error(
        "The savepoint name can only contain alphanumeric characters",
      );
    }

    name = name.toLowerCase();

    let savepoint = this.#savepoints.find((sv) => sv.name === name);

    if (savepoint) {
      try {
        await savepoint.update();
      } catch (e) {
        if (e instanceof PostgresError) {
          await this.commit();
          throw new TransactionError(this.name, e);
        }
        throw e;
      }
    } else {
      savepoint = new Savepoint(
        name,
        async (name: string) => {
          await this.queryArray(`SAVEPOINT ${name}`);
        },
        async (name: string) => {
          await this.queryArray(`RELEASE SAVEPOINT ${name}`);
        },
      );

      try {
        await savepoint.update();
      } catch (e) {
        if (e instanceof PostgresError) {
          await this.commit();
          throw new TransactionError(this.name, e);
        }
        throw e;
      }
      this.#savepoints.push(savepoint);
    }

    return savepoint;
  }
}
