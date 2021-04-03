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

// TODO
// Add transaction options
// Add transaction docs
// Explain how failed operations automatically release the client
class Transaction {
  #client: QueryClient;
  #savepoints: Savepoint[] = [];

  constructor(
    public name: string,
    client: QueryClient,
  ) {
    this.#client = client;
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

  /**
   * The begin method will officially begin the transaction, and it must be called before
   * any query or transaction operation is executed in order to lock the session
   * ```ts
   * const transaction = new Transaction("transaction_name");
   * await transaction.begin(); // Session is locked, transaction operations are now safe
   * // Important operations
   * await transaction.end(); // Session is unlocked, external operations can now take place
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

    try {
      await this.#client.queryArray`BEGIN`;
    } catch (e) {
      if (e instanceof PostgresError) {
        await this.end();
        throw new TransactionError(e);
      } else {
        throw e;
      }
    }
    this.#client.current_transaction = this.name;
  }

  // TODO
  // Add chain option
  // Explain differences between end method
  /**
   * The commit method will make permanent all changes made to the database in the
   * current transaction
   * 
   * ```ts
   * await transaction.begin();
   * // Important operations
   * await transaction.commit(); // Will terminate the transaction and save all changes
   * ```
   * 
   * Executing a commit will end the current transaction
   * 
   * https://www.postgresql.org/docs/13/sql-commit.html
   */
  async commit() {
    this.#assertTransactionOpen();

    try {
      await this.queryArray`COMMIT`;
      this.#releaseClient();
    } catch (e) {
      if (e instanceof PostgresError) {
        await this.end();
        throw new TransactionError(e);
      } else {
        throw e;
      }
    }
  }

  // TODO
  // Remove method, since it's esentially an alternative to commit
  async end() {
    this.#assertTransactionOpen();

    try {
      await this.queryArray`END`;
    } catch (e) {
      if (e instanceof PostgresError) {
        throw new TransactionError(e);
      } else {
        throw e;
      }
    }

    this.#savepoints = [];
    this.#releaseClient();
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
        await this.end();
        // deno-lint-ignore no-unreachable
        throw new TransactionError(e);
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
        await this.end();
        // deno-lint-ignore no-unreachable
        throw new TransactionError(e);
      } else {
        // deno-lint-ignore no-unreachable
        throw e;
      }
    }
  }

  // TODO
  // Method to display available savepoints

  // TODO
  // Add chain option
  /**
   * Rollbacks are a mechanism to undo transaction operations without compromising the data
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
   * await transaction.end(); // Commits all other changes
   * ```
   * https://www.postgresql.org/docs/13/sql-rollback.html
   */
  async rollback(savepoint?: string | Savepoint) {
    this.#assertTransactionOpen();

    if (typeof savepoint !== "undefined") {
      // deno-lint-ignore camelcase
      let savepoint_name: string;
      if (savepoint instanceof Savepoint) {
        savepoint_name = savepoint.name;
      } else {
        savepoint_name = savepoint.toLowerCase();
      }

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

    try {
      await this.queryArray`ROLLBACK`;
    } catch (e) {
      if (e instanceof PostgresError) {
        await this.end();
        throw new TransactionError(e);
      } else {
        throw e;
      }
    }
    this.#releaseClient();
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
          await this.end();
          throw new TransactionError(e);
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
          await this.end();
          throw new TransactionError(e);
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

  createTransaction(name: string): Transaction {
    return new Transaction(name, this);
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
