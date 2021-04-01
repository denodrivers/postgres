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
import { isTemplateString } from "./utils.ts";

export class QueryClient {
  // TODO
  // Rename
  locked = false;

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
   * 
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
    if (this.locked) {
      throw new Error(
        "This connection is currently locked by the x transaction",
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
    if (this.locked) {
      throw new Error(
        "This connection is currently locked by the x transaction",
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

  // TODO
  // Throw if there is already an open transaction
  async begin() {
    await this.queryArray("BEGIN");
    this.#client.locked = true;
  }

  // TODO
  // Throw if transaction ain't open
  async commit() {
    await this.queryArray("COMMIT");
  }

  // TODO
  // Throw if transaction ain't open
  async end() {
    await this.queryArray("END");
    this.#client.locked = false;
  }

  // TODO
  // Update documentation
  // Add an example showing how a throw inside a transaction does not release
  // the session
  /**
   * This method allows executed queries to be retrieved as array entries.
   * It supports a generic interface in order to type the entries retrieved by the query
   * 
   * ```ts
   * const {rows} = await my_client.queryArray(
   *  "SELECT ID, NAME FROM CLIENTS"
   * ); // Array<unknown[]>
   * 
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
    // TODO
    // Throw if transaction ain't open

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

    return this.#client._executeQuery(query);
  }

  // TODO
  // Update documentation
  // Add an example showing how a throw inside a transaction does not release
  // the session
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
    // TODO
    // Throw if transaction ain't open

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

    return this.#client._executeQuery<T>(query);
  }

  // TODO
  // Method to display available savepoints

  // TODO
  // Check if savepoint was registered
  // Throw if transaction ain't open
  /**
   * If rollback is called without a savepoint, it will terminate the current transaction
   */
  async rollback(savepoint?: string | Savepoint) {
    if (typeof savepoint !== "undefined") {
      // deno-lint-ignore camelcase
      let savepoint_name: string;
      if (savepoint instanceof Savepoint) {
        savepoint_name = savepoint.name;
      } else {
        // TODO
        // Cleanup string
        savepoint_name = savepoint;
      }

      // deno-lint-ignore camelcase
      const ts_savepoint = this.#savepoints.find(({ name }) =>
        name === savepoint_name
      );
      if (!ts_savepoint) {
        throw new Error(
          `There is no "${savepoint_name}" registered in this transaction`,
        );
      }
      if (!ts_savepoint.instances) {
        throw new Error(
          `There are no instances of "${savepoint_name}" left to rollback to`,
        );
      }

      await this.queryArray(`ROLLBACK TO ${savepoint_name}`);
      return;
    }

    await this.queryArray`ROLLBACK`;
    this.#client.locked = false;
  }

  // TODO
  // Save savepoint name and throw preventely
  // Research if savepoints can be removed
  // Generate random name
  // Check special characters
  /**
   * Savepoints are case insensitive and must start with an  character
   * 
   * ```ts
   * const savepoint = await transaction.save("MY_savepoint"); // returns a `Savepoint` with name "my_savepoint"
   * await transaction.rollback(savepoint);
   * ```
   */
  async savepoint(name: string): Promise<Savepoint> {
    const savepoint = new Savepoint(
      name,
      async (name: string) => {
        await this.queryArray(`SAVEPOINT ${name}`);
      },
      async (name: string) => {
        await this.queryArray(`RELEASE SAVEPOINT ${name}`);
      },
    );

    await savepoint.update();
    this.#savepoints.push(savepoint);

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
  }
}
