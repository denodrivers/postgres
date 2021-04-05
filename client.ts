import { Connection } from "./connection/connection.ts";
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
import { Transaction, TransactionOptions } from "./query/transaction.ts";
import { isTemplateString } from "./utils.ts";

export class QueryClient {
  get current_transaction(): string | null {
    return null;
  }

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

export class Client extends QueryClient {
  #connection: Connection;
  #current_transaction: string | null = null;

  constructor(config?: ConnectionOptions | ConnectionString) {
    super();
    this.#connection = new Connection(createParams(config));
  }

  _executeQuery(query: Query<ResultType.ARRAY>): Promise<QueryArrayResult>;
  _executeQuery(query: Query<ResultType.OBJECT>): Promise<QueryObjectResult>;
  _executeQuery(query: Query<ResultType>): Promise<QueryResult> {
    return this.#connection.query(query);
  }

  async connect(): Promise<void> {
    await this.#connection.startup();
  }

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
   *   will be visible inside the transaction once they are committed.
   * 
   * - Repeatable read: This isolates the transaction in a way that any external changes to the data we are reading
   *   won't be visible inside the transaction until it has finished
   *   ```ts
   *   const transaction = await client.createTransaction("my_transaction", { isolation_level: "repeatable_read" });
   *   ```
   * 
   * - Serializable: This isolation level prevents the current transaction from making persistent changes
   *   if the data they were reading at the beginning of the transaction has been modified (recommended)
   *   ```ts
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
   *   const transaction = await client.createTransaction("my_transaction", { read_only: true });
   *   ```
   * 
   * Last but not least, transactions allow you to share starting point snapshots between them.
   * For example, if you initialized a repeatable read transaction before a particularly sensible change
   * in the database, and you would like to start several transactions with that same before the change state
   * you can do the following:
   * 
   * ```ts
   * const snapshot = await transaction_1.getSnapshot();
   * const transaction_2 = client_2.createTransaction("new_transaction", { isolation_level: "repeatable_read", snapshot });
   * // transaction_2 now shares the same starting state that transaction_1 had
   * ```
   * 
   * https://www.postgresql.org/docs/13/tutorial-transactions.html
   * https://www.postgresql.org/docs/13/sql-set-transaction.html
   */
  createTransaction(name: string, options?: TransactionOptions): Transaction {
    return new Transaction(
      name,
      options,
      this,
      (name: string | null) => {
        this.#current_transaction = name;
      },
    );
  }

  get current_transaction() {
    return this.#current_transaction;
  }

  async end(): Promise<void> {
    await this.#connection.end();
    this.#current_transaction = null;
  }
}

export class PoolClient extends QueryClient {
  #connection: Connection;
  #current_transaction: string | null = null;
  #release: () => void;

  constructor(connection: Connection, releaseCallback: () => void) {
    super();
    this.#connection = connection;
    this.#release = releaseCallback;
  }

  get current_transaction() {
    return this.#current_transaction;
  }

  _executeQuery(query: Query<ResultType.ARRAY>): Promise<QueryArrayResult>;
  _executeQuery(query: Query<ResultType.OBJECT>): Promise<QueryObjectResult>;
  _executeQuery(query: Query<ResultType>): Promise<QueryResult> {
    return this.#connection.query(query);
  }

  async release(): Promise<void> {
    await this.#release();
    this.#current_transaction = null;
  }
}
