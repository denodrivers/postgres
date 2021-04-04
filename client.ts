import { Connection } from "./connection/connection.ts";
import { PostgresError, TransactionError } from "./connection/warning.ts";
import {
  ConnectionOptions,
  ConnectionString,
  createParams,
} from "./connection/connection_params.ts";
import {
  Query,
  QueryArguments,
  QueryArrayResult,
  QueryConfig,
  QueryObjectConfig,
  QueryObjectResult,
  QueryResult,
  ResultType,
  templateStringToQuery,
} from "./query/query.ts";
import { isTemplateString } from "./utils.ts";

// TODO
// Don't allow the current transaction to be set by user
export class QueryClient {
  current_transaction: string | null = null;

  /**
   * This function is meant to be replaced when being extended
   * 
   * It's sole purpose is to be a common interface implementations can use
   * regardless of their internal structure
   */
  _executeQuery<T extends Array<unknown>>(
    _query: Query<ResultType.ARRAY>,
  ): Promise<QueryArrayResult<T>>;
  _executeQuery<T extends Record<string, unknown>>(
    _query: Query<ResultType.OBJECT>,
  ): Promise<QueryObjectResult<T>>;
  _executeQuery(_query: Query<ResultType>): Promise<QueryResult> {
    throw new Error(
      `"${this._executeQuery.name}" hasn't been implemented for class "${this.constructor.name}"`,
    );
  }

  /**
   * This method allows executed queries to be retrieved as array entries.
   * It supports a generic interface in order to type the entries retrieved by the query
   * 
   * ```ts
   * const {rows} = await my_client.queryArray(
   *  "SELECT ID, NAME FROM CLIENTS"
   * ); // Array<unknown[]>
   * ```
   * 
   * You can pass type arguments to the query in order to hint TypeScript what the return value will be
   * ```ts
   * const {rows} = await my_client.queryArray<[number, string]>(
   *  "SELECT ID, NAME FROM CLIENTS"
   * ); // Array<[number, string]>
   * ```
   * 
   * It also allows you to execute prepared stamements with template strings
   * 
   * ```ts
   * const id = 12;
   * // Array<[number, string]>
   * const {rows} = await my_client.queryArray<[number, string]>`SELECT ID, NAME FROM CLIENTS WHERE ID = ${id}`;
   * ```
   */
  queryArray<T extends Array<unknown>>(
    query: string,
    ...args: QueryArguments
  ): Promise<QueryArrayResult<T>>;
  queryArray<T extends Array<unknown>>(
    config: QueryConfig,
  ): Promise<QueryArrayResult<T>>;
  queryArray<T extends Array<unknown>>(
    strings: TemplateStringsArray,
    ...args: QueryArguments
  ): Promise<QueryArrayResult<T>>;
  queryArray<T extends Array<unknown> = Array<unknown>>(
    // deno-lint-ignore camelcase
    query_template_or_config: TemplateStringsArray | string | QueryConfig,
    ...args: QueryArguments
  ): Promise<QueryArrayResult<T>> {
    if (this.current_transaction !== null) {
      throw new Error(
        `This connection is currently locked by the "${this.current_transaction}" transaction`,
      );
    }

    let query: Query<ResultType.ARRAY>;
    if (typeof query_template_or_config === "string") {
      query = new Query(query_template_or_config, ResultType.ARRAY, ...args);
    } else if (isTemplateString(query_template_or_config)) {
      query = templateStringToQuery(
        query_template_or_config,
        args,
        ResultType.ARRAY,
      );
    } else {
      query = new Query(query_template_or_config, ResultType.ARRAY);
    }

    return this._executeQuery(query);
  }

  /**
   * This method allows executed queries to be retrieved as object entries.
   * It supports a generic interface in order to type the entries retrieved by the query
   * 
   * ```ts
   * const {rows} = await my_client.queryObject(
   *  "SELECT ID, NAME FROM CLIENTS"
   * ); // Record<string, unknown>
   * 
   * const {rows} = await my_client.queryObject<{id: number, name: string}>(
   *  "SELECT ID, NAME FROM CLIENTS"
   * ); // Array<{id: number, name: string}>
   * ```
   * 
   * You can also map the expected results to object fields using the configuration interface.
   * This will be assigned in the order they were provided
   * 
   * ```ts
   * const {rows} = await my_client.queryObject(
   *  "SELECT ID, NAME FROM CLIENTS"
   * );
   * 
   * console.log(rows); // [{id: 78, name: "Frank"}, {id: 15, name: "Sarah"}]
   * 
   * const {rows} = await my_client.queryObject({
   *  text: "SELECT ID, NAME FROM CLIENTS",
   *  fields: ["personal_id", "complete_name"],
   * });
   * 
   * console.log(rows); // [{personal_id: 78, complete_name: "Frank"}, {personal_id: 15, complete_name: "Sarah"}]
   * ```
   * 
   * It also allows you to execute prepared stamements with template strings
   * 
   * ```ts
   * const id = 12;
   * // Array<{id: number, name: string}>
   * const {rows} = await my_client.queryObject<{id: number, name: string}>`SELECT ID, NAME FROM CLIENTS WHERE ID = ${id}`;
   * ```
   */
  queryObject<T extends Record<string, unknown>>(
    query: string,
    ...args: QueryArguments
  ): Promise<QueryObjectResult<T>>;
  queryObject<T extends Record<string, unknown>>(
    config: QueryObjectConfig,
  ): Promise<QueryObjectResult<T>>;
  queryObject<T extends Record<string, unknown>>(
    query: TemplateStringsArray,
    ...args: QueryArguments
  ): Promise<QueryObjectResult<T>>;
  queryObject<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(
    // deno-lint-ignore camelcase
    query_template_or_config:
      | string
      | QueryObjectConfig
      | TemplateStringsArray,
    ...args: QueryArguments
  ): Promise<QueryObjectResult<T>> {
    if (this.current_transaction !== null) {
      throw new Error(
        `This connection is currently locked by the "${this.current_transaction}" transaction`,
      );
    }

    let query: Query<ResultType.OBJECT>;
    if (typeof query_template_or_config === "string") {
      query = new Query(query_template_or_config, ResultType.OBJECT, ...args);
    } else if (isTemplateString(query_template_or_config)) {
      query = templateStringToQuery(
        query_template_or_config,
        args,
        ResultType.OBJECT,
      );
    } else {
      query = new Query(
        query_template_or_config as QueryObjectConfig,
        ResultType.OBJECT,
      );
    }

    return this._executeQuery<T>(query);
  }
}

class Savepoint {
  /**
   * This is the count of the current savepoint instances in the transaction
   */
  #instance_count = 0;
  #release_callback: (name: string) => Promise<void>;
  #update_callback: (name: string) => Promise<void>;

  constructor(
    public readonly name: string,
    // deno-lint-ignore camelcase
    update_callback: (name: string) => Promise<void>,
    // deno-lint-ignore camelcase
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
   * const savepoint = await transaction.savepoint("n1");
   * await savepoint.release();
   * transaction.rollback(savepoint); // Error, can't rollback because the savepoint was released
   * ```
   * 
   * It will also allow you to set the savepoint to the position it had before the last update
   * 
   * * ```ts
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
   * const savepoint = await transaction.savepoint("n1");
   * transaction.queryArray`INSERT INTO MY_TABLE (X) VALUES (${my_value})`;
   * await savepoint.update(); // Rolling back will now return you to this point on the transaction
   * ```
   * 
   * You can also undo a savepoint update by using the `release` method
   * 
   * ```ts
   * const savepoint = await transaction.savepoint("n1");
   * transaction.queryArray`DELETE FROM VERY_IMPORTANT_TABLE`;
   * await savepoint.update(); // Oops, shouldn't have updated the savepoint
   * await savepoint.release(); // This will undo the last update and return the savepoint to the first instance
   * await transaction.rollback(); // Will rollback before the table was deleted
   * ```
   * */
  async update() {
    await this.#update_callback(this.name);
    ++this.#instance_count;
  }
}

type IsolationLevel = "read_committed" | "repeatable_read" | "serializable";

type TransactionOptions = {
  // deno-lint-ignore camelcase
  isolation_level?: IsolationLevel;
  // deno-lint-ignore camelcase
  read_only?: boolean;
};

// TODO
// Add snapshot option
// Add deferred option
// Explain how failed operations automatically release the client
/**
 * Transactions are a powerful feature that guarantees safe operations by allowing you to control
 * the outcome of a series of statements and undo, reset, and step back said operations to
 * your liking
 * 
 * In order to create a transaction, use the `createTransaction` method in your client as follows:
 * 
 * ```ts
 * const transaction = client.createTransaction("my_transaction_name");
 * await transaction.begin();
 * // All statements between begin and commit will happen inside the transaction
 * await transaction.commit(); // All changes are saved
 * ```
 * 
 * All statements that fail in query execution will cause the current transaction to abort and release
 * the client without applying any of the changes that took place inside it
 * 
 * ```ts
 * await transaction.begin();
 * await transaction.queryArray`INSERT INTO MY_TABLE (X) VALUES ${"some_value"}`;
 * try {
 *   await transaction.queryArray`SELECT []`; // Invalid syntax, transaction aborted, changes won't be applied
 * }catch(e){
 *   await transaction.commit(); // Will throw, current transaction has already finished
 * }
 * ```
 * 
 * This however, only happens if the error is of execution in nature, validation errors won't abort
 * the transaction
 * 
 * ```ts
 * await transaction.begin();
 * await transaction.queryArray`INSERT INTO MY_TABLE (X) VALUES ${"some_value"}`;
 * try {
 *   await transaction.rollback("unexistent_savepoint"); // Validation error
 * }catch(e){
 *   await transaction.commit(); // Transaction will end, changes will be saved
 * }
 * ```
 * 
 * A transaction has many options to ensure modifications made to the database are safe and
 * have the expected outcome, which is a hard thing to accomplish in a database with many concurrent users,
 * and it does so by allowing you to set local levels of isolation to the transaction you are about to begin
 * 
 * Each transaction can execute with the following levels of isolation:
 * 
 * - Read committed: This is the normal behavior of a transaction. External changes to the database
 *   will be visible inside the transaction once they are committed
 * - Repeatable read: This isolates the transaction in a way that any external changes to the data we are reading
 *   won't be visible inside the transaction until it has finished
 * - Serializable: This isolation level prevents the current transaction from making persistent changes
 *   if the data they were reading at the beginning of the transaction has been modified (recommended)
 * 
 * Additionally, each transaction allows you to set two levels of access to the data:
 * 
 * - Read write: This is the default mode, it allows you to execute all commands you have access to normally
 * - Read only: Disables all commands that can make changes to the database. Main use for the read only mode
 *   is to in conjuction with the repeatable read isolation, ensuring the data you are reading does not change
 *   during the transaction, specially useful for data extraction
 * 
 * https://www.postgresql.org/docs/13/tutorial-transactions.html
 * https://www.postgresql.org/docs/13/sql-set-transaction.html
 */
class Transaction {
  #client: QueryClient;
  #isolation_level: IsolationLevel;
  #read_only: boolean;
  #savepoints: Savepoint[] = [];

  constructor(
    public name: string,
    options: TransactionOptions | undefined,
    client: QueryClient,
  ) {
    this.#client = client;
    this.#isolation_level = options?.isolation_level ?? "read_committed";
    this.#read_only = options?.read_only ?? false;
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
  #assertTransactionOpen = () => {
    if (this.#client.current_transaction !== this.name) {
      throw new Error(
        `This transaction has not been started yet, make sure to use the "begin" method to do so`,
      );
    }
  };

  #releaseClient = () => {
    this.#client.current_transaction = null;
  };

  #resetTransaction = () => {
    this.#savepoints = [];
  };

  /**
   * The begin method will officially begin the transaction, and it must be called before
   * any query or transaction operation is executed in order to lock the session
   * ```ts
   * const transaction = client.createTransaction("transaction_name");
   * await transaction.begin(); // Session is locked, transaction operations are now safe
   * // Important operations
   * await transaction.commit(); // Session is unlocked, external operations can now take place
   * ```
   * https://www.postgresql.org/docs/13/sql-begin.html
   */
  async begin() {
    if (this.#client.current_transaction !== null) {
      if (this.#client.current_transaction === this.name) {
        throw new Error(
          "This transaction is already open",
        );
      }

      throw new Error(
        `This client already has an ongoing transaction "${this.#client.current_transaction}"`,
      );
    }

    // deno-lint-ignore camelcase
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

    try {
      await this.#client.queryArray(
        `BEGIN ${permissions} ISOLATION LEVEL ${isolation_level}`,
      );
    } catch (e) {
      if (e instanceof PostgresError) {
        throw new TransactionError(this.name, e);
      } else {
        throw e;
      }
    }

    this.#client.current_transaction = this.name;
  }

  /**
   * The commit method will make permanent all changes made to the database in the
   * current transaction and end the current transaction
   * 
   * ```ts
   * await transaction.begin();
   * // Important operations
   * await transaction.commit(); // Will terminate the transaction and save all changes
   * ```
   * 
   * The commit method allows you to specify a "chain" option, that allows you to both commit the current changes and
   * start a new with the same transaction parameters in a single statement
   * 
   * ```ts
   * // ...
   * // Transaction operations I want to commit
   * await transaction.commit({ chain: true }); // All changes are saved, following statements will be executed inside a transaction
   * await transaction.query`DELETE SOMETHING FROM SOMEWHERE`; // Still inside the transaction
   * await transaction.commit(); // The transaction finishes for good
   * ```
   * 
   * https://www.postgresql.org/docs/13/sql-commit.html
   */
  async commit(options?: { chain?: boolean }) {
    this.#assertTransactionOpen();

    const chain = options?.chain ?? false;

    try {
      await this.queryArray(`COMMIT ${chain ? "AND CHAIN" : ""}`);
    } catch (e) {
      if (e instanceof PostgresError) {
        throw new TransactionError(this.name, e);
      } else {
        throw e;
      }
    }

    this.#resetTransaction();
    if (!chain) {
      this.#releaseClient();
    }
  }

  /**
   * This method allows executed queries to be retrieved as array entries.
   * It supports a generic interface in order to type the entries retrieved by the query
   * 
   * ```ts
   * const {rows} = await transaction.queryArray(
   *  "SELECT ID, NAME FROM CLIENTS"
   * ); // Array<unknown[]>
   * ```
   * 
   * You can pass type arguments to the query in order to hint TypeScript what the return value will be
   * ```ts
   * const {rows} = await transaction.queryArray<[number, string]>(
   *  "SELECT ID, NAME FROM CLIENTS"
   * ); // Array<[number, string]>
   * ```
   * 
   * It also allows you to execute prepared stamements with template strings
   * 
   * ```ts
   * const id = 12;
   * // Array<[number, string]>
   * const {rows} = await transaction.queryArray<[number, string]>`SELECT ID, NAME FROM CLIENTS WHERE ID = ${id}`;
   * ```
   */
  async queryArray<T extends Array<unknown>>(
    query: string,
    ...args: QueryArguments
  ): Promise<QueryArrayResult<T>>;
  async queryArray<T extends Array<unknown>>(
    config: QueryConfig,
  ): Promise<QueryArrayResult<T>>;
  async queryArray<T extends Array<unknown>>(
    strings: TemplateStringsArray,
    ...args: QueryArguments
  ): Promise<QueryArrayResult<T>>;
  async queryArray<T extends Array<unknown> = Array<unknown>>(
    // deno-lint-ignore camelcase
    query_template_or_config: TemplateStringsArray | string | QueryConfig,
    ...args: QueryArguments
  ): Promise<QueryArrayResult<T>> {
    this.#assertTransactionOpen();

    let query: Query<ResultType.ARRAY>;
    if (typeof query_template_or_config === "string") {
      query = new Query(query_template_or_config, ResultType.ARRAY, ...args);
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
      return await this.#client._executeQuery(query);
    } catch (e) {
      // deno-lint-ignore no-unreachable
      if (e instanceof PostgresError) {
        // deno-lint-ignore no-unreachable
        await this.commit();
        // deno-lint-ignore no-unreachable
        throw new TransactionError(this.name, e);
      } else {
        // deno-lint-ignore no-unreachable
        throw e;
      }
    }
  }

  /**
   * This method allows executed queries to be retrieved as object entries.
   * It supports a generic interface in order to type the entries retrieved by the query
   * 
   * ```ts
   * const {rows} = await transaction.queryObject(
   *  "SELECT ID, NAME FROM CLIENTS"
   * ); // Record<string, unknown>
   * 
   * const {rows} = await transaction.queryObject<{id: number, name: string}>(
   *  "SELECT ID, NAME FROM CLIENTS"
   * ); // Array<{id: number, name: string}>
   * ```
   * 
   * You can also map the expected results to object fields using the configuration interface.
   * This will be assigned in the order they were provided
   * 
   * ```ts
   * const {rows} = await transaction.queryObject(
   *  "SELECT ID, NAME FROM CLIENTS"
   * );
   * 
   * console.log(rows); // [{id: 78, name: "Frank"}, {id: 15, name: "Sarah"}]
   * 
   * const {rows} = await transaction.queryObject({
   *  text: "SELECT ID, NAME FROM CLIENTS",
   *  fields: ["personal_id", "complete_name"],
   * });
   * 
   * console.log(rows); // [{personal_id: 78, complete_name: "Frank"}, {personal_id: 15, complete_name: "Sarah"}]
   * ```
   * 
   * It also allows you to execute prepared stamements with template strings
   * 
   * ```ts
   * const id = 12;
   * // Array<{id: number, name: string}>
   * const {rows} = await transaction.queryObject<{id: number, name: string}>`SELECT ID, NAME FROM CLIENTS WHERE ID = ${id}`;
   * ```
   */
  async queryObject<T extends Record<string, unknown>>(
    query: string,
    ...args: QueryArguments
  ): Promise<QueryObjectResult<T>>;
  async queryObject<T extends Record<string, unknown>>(
    config: QueryObjectConfig,
  ): Promise<QueryObjectResult<T>>;
  async queryObject<T extends Record<string, unknown>>(
    query: TemplateStringsArray,
    ...args: QueryArguments
  ): Promise<QueryObjectResult<T>>;
  async queryObject<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(
    // deno-lint-ignore camelcase
    query_template_or_config:
      | string
      | QueryObjectConfig
      | TemplateStringsArray,
    ...args: QueryArguments
  ): Promise<QueryObjectResult<T>> {
    this.#assertTransactionOpen();

    let query: Query<ResultType.OBJECT>;
    if (typeof query_template_or_config === "string") {
      query = new Query(query_template_or_config, ResultType.OBJECT, ...args);
    } else if (isTemplateString(query_template_or_config)) {
      query = templateStringToQuery(
        query_template_or_config,
        args,
        ResultType.OBJECT,
      );
    } else {
      query = new Query(
        query_template_or_config as QueryObjectConfig,
        ResultType.OBJECT,
      );
    }

    try {
      return await this.#client._executeQuery<T>(query);
    } catch (e) {
      // deno-lint-ignore no-unreachable
      if (e instanceof PostgresError) {
        // deno-lint-ignore no-unreachable
        await this.commit();
        // deno-lint-ignore no-unreachable
        throw new TransactionError(this.name, e);
      } else {
        // deno-lint-ignore no-unreachable
        throw e;
      }
    }
  }

  // TODO
  // Method to display available savepoints

  /**
   * Rollbacks are a mechanism to undo transaction operations without compromising the data that was modified during
   * the transaction
   * 
   * A rollback can be executed the following way
   * ```ts
   * // ...
   * // Very very important operations that went very, very wrong
   * await transaction.rollback(); // Like nothing ever happened
   * ```
   * 
   * Calling a rollback without arguments will terminate the current transaction and undo all changes,
   * but it can be used in conjuction with the savepoint feature to rollback specific changes like the following
   * 
   * ```ts
   * // ...
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
   * // ...
   * // Transaction operations I want to undo
   * await transaction.rollback({ chain: true }); // All changes are undone, but the following statements will be executed inside a transaction as well
   * await transaction.query`DELETE SOMETHING FROM SOMEWHERE`; // Still inside the transaction
   * await transaction.commit(); // The transaction finishes for good
   * ```
   * 
   * However, the "chain" option can't be used alongside a savepoint, even though they are similar
   * 
   * A savepoint is meant to reset progress up to a certain point, while a chained rollback is meant to reset all progress
   * and start from scratch
   * 
   * ```ts
   * await transaction.rollback({ chain: true, savepoint: my_savepoint }); // Error, can't both return to savepoint and reset transaction
   * ```
   * https://www.postgresql.org/docs/13/sql-rollback.html
   */
  async rollback(savepoint?: string | Savepoint): Promise<void>;
  async rollback(options?: { savepoint?: string | Savepoint }): Promise<void>;
  async rollback(options?: { chain?: boolean }): Promise<void>;
  async rollback(
    // deno-lint-ignore camelcase
    savepoint_or_options?: string | Savepoint | {
      savepoint?: string | Savepoint;
    } | { chain?: boolean },
  ): Promise<void> {
    this.#assertTransactionOpen();

    // deno-lint-ignore camelcase
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

    // deno-lint-ignore camelcase
    let savepoint_name: string | undefined;
    if (savepoint_option instanceof Savepoint) {
      savepoint_name = savepoint_option.name;
    } else if (typeof savepoint_option === "string") {
      savepoint_name = savepoint_option.toLowerCase();
    }

    // deno-lint-ignore camelcase
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
      // deno-lint-ignore camelcase
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
      this.#releaseClient();
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
   * const savepoint = await transaction.save("MY_savepoint"); // returns a `Savepoint` with name "my_savepoint"
   * await transaction.rollback(savepoint);
   * await savepoint.release(); // The savepoint will be removed
   * ```
   * All savepoints can have multiple positions in a transaction, and you can change or update
   * this positions by using the `update` and `release` methods
   * ```ts
   * const savepoint = await transaction.save("n1");
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
   * const savepoint_a = await transaction.save("a");
   * await transaction.queryArray`DELETE FROM MY_TABLE`;
   * const savepoint_b = await transaction.save("a"); // They will be the same savepoint, but the savepoint will be updated to this position
   * await transaction.rollback(savepoint_a); // Rolls back to savepoint_b
   * ```
   * https://www.postgresql.org/docs/13/sql-savepoint.html
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

export class Client extends QueryClient {
  protected _connection: Connection;

  constructor(config?: ConnectionOptions | ConnectionString) {
    super();
    this._connection = new Connection(createParams(config));
  }

  _executeQuery(query: Query<ResultType.ARRAY>): Promise<QueryArrayResult>;
  _executeQuery(query: Query<ResultType.OBJECT>): Promise<QueryObjectResult>;
  _executeQuery(query: Query<ResultType>): Promise<QueryResult> {
    return this._connection.query(query);
  }

  async connect(): Promise<void> {
    await this._connection.startup();
  }

  // TODO
  // Add docs here
  createTransaction(name: string, options?: TransactionOptions): Transaction {
    return new Transaction(name, options, this);
  }

  async end(): Promise<void> {
    await this._connection.end();
    this.current_transaction = null;
  }
}

export class PoolClient extends QueryClient {
  protected _connection: Connection;
  private _releaseCallback: () => void;

  constructor(connection: Connection, releaseCallback: () => void) {
    super();
    this._connection = connection;
    this._releaseCallback = releaseCallback;
  }

  _executeQuery(query: Query<ResultType.ARRAY>): Promise<QueryArrayResult>;
  _executeQuery(query: Query<ResultType.OBJECT>): Promise<QueryObjectResult>;
  _executeQuery(query: Query<ResultType>): Promise<QueryResult> {
    return this._connection.query(query);
  }

  async release(): Promise<void> {
    await this._releaseCallback();
    this.current_transaction = null;
  }
}
