import { type QueryClient } from "../client.ts";
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

export class Savepoint {
  /**
   * This is the count of the current savepoint instances in the transaction
   */
  #instance_count = 0;
  #release_callback: (name: string) => Promise<void>;
  #update_callback: (name: string) => Promise<void>;

  constructor(
    public readonly name: string,
    update_callback: (name: string) => Promise<void>,
    release_callback: (name: string) => Promise<void>,
  ) {
    this.#release_callback = release_callback;
    this.#update_callback = update_callback;
  }

  get instances() {
    return this.#instance_count;
  }

  /**
   * Releasing a savepoint will remove it's last instance in the transaction
   *
   * ```ts
   * import { Client } from "../client.ts";
   *
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * const savepoint = await transaction.savepoint("n1");
   * await savepoint.release();
   * transaction.rollback(savepoint); // Error, can't rollback because the savepoint was released
   * ```
   *
   * It will also allow you to set the savepoint to the position it had before the last update
   *
   * ```ts
   * import { Client } from "../client.ts";
   *
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * const savepoint = await transaction.savepoint("n1");
   * await savepoint.update();
   * await savepoint.release(); // This drops the update of the last statement
   * transaction.rollback(savepoint); // Will rollback to the first instance of the savepoint
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
   * import { Client } from "../client.ts";
   *
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * const my_value = "some value";
   *
   * const savepoint = await transaction.savepoint("n1");
   * transaction.queryArray`INSERT INTO MY_TABLE (X) VALUES (${my_value})`;
   * await savepoint.update(); // Rolling back will now return you to this point on the transaction
   * ```
   *
   * You can also undo a savepoint update by using the `release` method
   *
   * ```ts
   * import { Client } from "../client.ts";
   *
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * const savepoint = await transaction.savepoint("n1");
   * transaction.queryArray`DELETE FROM VERY_IMPORTANT_TABLE`;
   * await savepoint.update(); // Oops, shouldn't have updated the savepoint
   * await savepoint.release(); // This will undo the last update and return the savepoint to the first instance
   * await transaction.rollback(); // Will rollback before the table was deleted
   * ```
   */
  async update() {
    await this.#update_callback(this.name);
    ++this.#instance_count;
  }
}

type IsolationLevel = "read_committed" | "repeatable_read" | "serializable";

export type TransactionOptions = {
  isolation_level?: IsolationLevel;
  read_only?: boolean;
  snapshot?: string;
};

export class Transaction {
  #client: QueryClient;
  #executeQuery: (query: Query<ResultType>) => Promise<QueryResult>;
  #isolation_level: IsolationLevel;
  #read_only: boolean;
  #savepoints: Savepoint[] = [];
  #snapshot?: string;
  #updateClientLock: (name: string | null) => void;

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

  get isolation_level() {
    return this.#isolation_level;
  }

  get savepoints() {
    return this.#savepoints;
  }

  /**
   * This method will throw if the transaction opened in the client doesn't match this one
   */
  #assertTransactionOpen() {
    if (this.#client.session.current_transaction !== this.name) {
      throw new Error(
        `This transaction has not been started yet, make sure to use the "begin" method to do so`,
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
   * import { Client } from "../client.ts";
   *
   * const client = new Client();
   * const transaction = client.createTransaction("transaction_name");
   *
   * await transaction.begin(); // Session is locked, transaction operations are now safe
   * // Important operations
   * await transaction.commit(); // Session is unlocked, external operations can now take place
   * ```
   * https://www.postgresql.org/docs/14/sql-begin.html
   */
  async begin() {
    if (this.#client.session.current_transaction !== null) {
      if (this.#client.session.current_transaction === this.name) {
        throw new Error(
          "This transaction is already open",
        );
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
      } else {
        throw e;
      }
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
   * import { Client } from "../client.ts";
   *
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * await transaction.begin();
   * // Important operations
   * await transaction.commit(); // Will terminate the transaction and save all changes
   * ```
   *
   * The commit method allows you to specify a "chain" option, that allows you to both commit the current changes and
   * start a new with the same transaction parameters in a single statement
   *
   * ```ts
   * import { Client } from "../client.ts";
   *
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * // Transaction operations I want to commit
   * await transaction.commit({ chain: true }); // All changes are saved, following statements will be executed inside a transaction
   * await transaction.queryArray`DELETE SOMETHING FROM SOMEWHERE`; // Still inside the transaction
   * await transaction.commit(); // The transaction finishes for good
   * ```
   *
   * https://www.postgresql.org/docs/14/sql-commit.html
   */
  async commit(options?: { chain?: boolean }) {
    this.#assertTransactionOpen();

    const chain = options?.chain ?? false;

    if (!this.#committed) {
      this.#committed = true;
      try {
        await this.queryArray(`COMMIT ${chain ? "AND CHAIN" : ""}`);
      } catch (e) {
        if (e instanceof PostgresError) {
          throw new TransactionError(this.name, e);
        } else {
          throw e;
        }
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
   * import { Client } from "../client.ts";
   *
   * const client_1 = new Client();
   * const client_2 = new Client();
   * const transaction_1 = client_1.createTransaction("transaction");
   *
   * const snapshot = await transaction_1.getSnapshot();
   * const transaction_2 = client_2.createTransaction("new_transaction", { isolation_level: "repeatable_read", snapshot });
   * // transaction_2 now shares the same starting state that transaction_1 had
   * ```
   * https://www.postgresql.org/docs/14/functions-admin.html#FUNCTIONS-SNAPSHOT-SYNCHRONIZATION
   */
  async getSnapshot(): Promise<string> {
    this.#assertTransactionOpen();

    const { rows } = await this.queryObject<
      { snapshot: string }
    >`SELECT PG_EXPORT_SNAPSHOT() AS SNAPSHOT;`;
    return rows[0].snapshot;
  }

  /**
   * This method allows executed queries to be retrieved as array entries.
   * It supports a generic interface in order to type the entries retrieved by the query
   *
   * ```ts
   * import { Client } from "../client.ts";
   *
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * const {rows} = await transaction.queryArray(
   *  "SELECT ID, NAME FROM CLIENTS"
   * ); // Array<unknown[]>
   * ```
   *
   * You can pass type arguments to the query in order to hint TypeScript what the return value will be
   * ```ts
   * import { Client } from "../client.ts";
   *
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * const { rows } = await transaction.queryArray<[number, string]>(
   *  "SELECT ID, NAME FROM CLIENTS"
   * ); // Array<[number, string]>
   * ```
   *
   * It also allows you to execute prepared stamements with template strings
   *
   * ```ts
   * import { Client } from "../client.ts";
   *
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * const id = 12;
   * // Array<[number, string]>
   * const { rows } = await transaction.queryArray<[number, string]>`SELECT ID, NAME FROM CLIENTS WHERE ID = ${id}`;
   * ```
   */
  async queryArray<T extends Array<unknown>>(
    query: string,
    args?: QueryArguments,
  ): Promise<QueryArrayResult<T>>;
  async queryArray<T extends Array<unknown>>(
    config: QueryOptions,
  ): Promise<QueryArrayResult<T>>;
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
      return await this.#executeQuery(query) as QueryArrayResult<T>;
    } catch (e) {
      if (e instanceof PostgresError) {
        await this.commit();
        throw new TransactionError(this.name, e);
      } else {
        throw e;
      }
    }
  }

  /**
   * This method allows executed queries to be retrieved as object entries.
   * It supports a generic interface in order to type the entries retrieved by the query
   *
   * ```ts
   * import { Client } from "../client.ts";
   *
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * {
   *   const { rows } = await transaction.queryObject(
   *     "SELECT ID, NAME FROM CLIENTS"
   *   ); // Record<string, unknown>
   * }
   *
   * {
   *   const { rows } = await transaction.queryObject<{id: number, name: string}>(
   *     "SELECT ID, NAME FROM CLIENTS"
   *   ); // Array<{id: number, name: string}>
   * }
   * ```
   *
   * You can also map the expected results to object fields using the configuration interface.
   * This will be assigned in the order they were provided
   *
   * ```ts
   * import { Client } from "../client.ts";
   *
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * {
   *   const { rows } = await transaction.queryObject(
   *     "SELECT ID, NAME FROM CLIENTS"
   *   );
   *
   *   console.log(rows); // [{id: 78, name: "Frank"}, {id: 15, name: "Sarah"}]
   * }
   *
   * {
   *   const { rows } = await transaction.queryObject({
   *     text: "SELECT ID, NAME FROM CLIENTS",
   *     fields: ["personal_id", "complete_name"],
   *   });
   *
   *   console.log(rows); // [{personal_id: 78, complete_name: "Frank"}, {personal_id: 15, complete_name: "Sarah"}]
   * }
   * ```
   *
   * It also allows you to execute prepared stamements with template strings
   *
   * ```ts
   * import { Client } from "../client.ts";
   *
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * const id = 12;
   * // Array<{id: number, name: string}>
   * const {rows} = await transaction.queryObject<{id: number, name: string}>`SELECT ID, NAME FROM CLIENTS WHERE ID = ${id}`;
   * ```
   */
  async queryObject<T>(
    query: string,
    args?: QueryArguments,
  ): Promise<QueryObjectResult<T>>;
  async queryObject<T>(
    config: QueryObjectOptions,
  ): Promise<QueryObjectResult<T>>;
  async queryObject<T>(
    query: TemplateStringsArray,
    ...args: unknown[]
  ): Promise<QueryObjectResult<T>>;
  async queryObject<
    T = Record<string, unknown>,
  >(
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
      return await this.#executeQuery(query) as QueryObjectResult<T>;
    } catch (e) {
      if (e instanceof PostgresError) {
        await this.commit();
        throw new TransactionError(this.name, e);
      } else {
        throw e;
      }
    }
  }

  /**
   * Rollbacks are a mechanism to undo transaction operations without compromising the data that was modified during
   * the transaction
   *
   * A rollback can be executed the following way
   * ```ts
   * import { Client } from "../client.ts";
   *
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * // Very very important operations that went very, very wrong
   * await transaction.rollback(); // Like nothing ever happened
   * ```
   *
   * Calling a rollback without arguments will terminate the current transaction and undo all changes,
   * but it can be used in conjuction with the savepoint feature to rollback specific changes like the following
   *
   * ```ts
   * import { Client } from "../client.ts";
   *
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * // Important operations I don't want to rollback
   * const savepoint = await transaction.savepoint("before_disaster");
   * await transaction.queryArray`UPDATE MY_TABLE SET X = 0`; // Oops, update without where
   * await transaction.rollback(savepoint); // "before_disaster" would work as well
   * // Everything that happened between the savepoint and the rollback gets undone
   * await transaction.commit(); // Commits all other changes
   * ```
   *
   * The rollback method allows you to specify a "chain" option, that allows you to not only undo the current transaction
   * but to restart it with the same parameters in a single statement
   *
   * ```ts
   * import { Client } from "../client.ts";
   *
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * // Transaction operations I want to undo
   * await transaction.rollback({ chain: true }); // All changes are undone, but the following statements will be executed inside a transaction as well
   * await transaction.queryArray`DELETE SOMETHING FROM SOMEWHERE`; // Still inside the transaction
   * await transaction.commit(); // The transaction finishes for good
   * ```
   *
   * However, the "chain" option can't be used alongside a savepoint, even though they are similar
   *
   * A savepoint is meant to reset progress up to a certain point, while a chained rollback is meant to reset all progress
   * and start from scratch
   *
   * ```ts
   * import { Client } from "../client.ts";
   *
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * // @ts-expect-error
   * await transaction.rollback({ chain: true, savepoint: "my_savepoint" }); // Error, can't both return to savepoint and reset transaction
   * ```
   * https://www.postgresql.org/docs/14/sql-rollback.html
   */
  async rollback(savepoint?: string | Savepoint): Promise<void>;
  async rollback(options?: { savepoint?: string | Savepoint }): Promise<void>;
  async rollback(options?: { chain?: boolean }): Promise<void>;
  async rollback(
    savepoint_or_options?: string | Savepoint | {
      savepoint?: string | Savepoint;
    } | { chain?: boolean },
  ): Promise<void> {
    this.#assertTransactionOpen();

    let savepoint_option: Savepoint | string | undefined;
    if (
      typeof savepoint_or_options === "string" ||
      savepoint_or_options instanceof Savepoint
    ) {
      savepoint_option = savepoint_or_options;
    } else {
      savepoint_option =
        (savepoint_or_options as { savepoint?: string | Savepoint })?.savepoint;
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
      const ts_savepoint = this.#savepoints.find(({ name }) =>
        name === savepoint_name
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
      } else {
        throw e;
      }
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
   * import { Client } from "../client.ts";
   *
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * const savepoint = await transaction.savepoint("MY_savepoint"); // returns a `Savepoint` with name "my_savepoint"
   * await transaction.rollback(savepoint);
   * await savepoint.release(); // The savepoint will be removed
   * ```
   * All savepoints can have multiple positions in a transaction, and you can change or update
   * this positions by using the `update` and `release` methods
   * ```ts
   * import { Client } from "../client.ts";
   *
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * const savepoint = await transaction.savepoint("n1");
   * await transaction.queryArray`INSERT INTO MY_TABLE VALUES (${'A'}, ${2})`;
   * await savepoint.update(); // The savepoint will continue from here
   * await transaction.queryArray`DELETE FROM MY_TABLE`;
   * await transaction.rollback(savepoint); // The transaction will rollback before the delete, but after the insert
   * await savepoint.release(); // The last savepoint will be removed, the original one will remain
   * await transaction.rollback(savepoint); // It rolls back before the insert
   * await savepoint.release(); // All savepoints are released
   * ```
   *
   * Creating a new savepoint with an already used name will return you a reference to
   * the original savepoint
   * ```ts
   * import { Client } from "../client.ts";
   *
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * const savepoint_a = await transaction.savepoint("a");
   * await transaction.queryArray`DELETE FROM MY_TABLE`;
   * const savepoint_b = await transaction.savepoint("a"); // They will be the same savepoint, but the savepoint will be updated to this position
   * await transaction.rollback(savepoint_a); // Rolls back to savepoint_b
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
        } else {
          throw e;
        }
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
        } else {
          throw e;
        }
      }
      this.#savepoints.push(savepoint);
    }

    return savepoint;
  }
}
