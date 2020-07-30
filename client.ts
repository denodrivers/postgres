import { Connection } from "./connection.ts";
import { ConnectionOptions, createParams } from "./connection_params.ts";
import { Query, QueryConfig, QueryResult } from "./query.ts";
import { PostgresError } from "./error.ts";
import { log } from "./deps.ts";

/** Transaction processor */
export interface TransactionProcessor<T> {
  (connection: Connection): Promise<T>;
}

export class Client {
  protected _connection: Connection;

  constructor(config?: ConnectionOptions | string) {
    const connectionParams = createParams(config);
    this._connection = new Connection(connectionParams);
  }

  async connect(): Promise<void> {
    await this._connection.startup();
    await this._connection.initSQL();
  }

  // TODO: can we use more specific type for args?
  async query(
    text: string | QueryConfig,
    // deno-lint-ignore no-explicit-any
    ...args: any[]
  ): Promise<QueryResult> {
    const query = new Query(text, ...args);
    return await this._connection.query(query);
  }

  async multiQuery(queries: QueryConfig[]): Promise<QueryResult[]> {
    const result: QueryResult[] = [];

    for (const query of queries) {
      result.push(await this.query(query));
    }

    return result;
  }

  async end(): Promise<void> {
    await this._connection.end();
  }

  // Support `using` module
  _aenter = this.connect;
  _aexit = this.end;

  /**
 * Use a connection/meant for transaction processor
 * 
 * @param fn transation processor
 */
  async useConnection<T>(fn: (conn: Connection) => Promise<T>) {
    if (!this._connection) {
      throw new Error("Unconnected");
    }
    try {
      const result = await fn(this._connection);
      return result;
    } catch (error) {

      throw new PostgresError(
        { severity: "high", code: "T", message: error.message });
    }
  }


  /**
  * Execute a transaction process, and the transaction successfully
  * returns the return value of the transaction process
  * @param processor transation processor
  */
  async transaction<T = any>(processor: TransactionProcessor<T>): Promise<T> {
    return await this.useConnection(async (connection) => {
      try {
        await connection.query(new Query("BEGIN"));
        const result = await processor(connection);
        await connection.query(new Query("COMMIT"));
        return result;
      } catch (error) {
        log.info(`ROLLBACK: ${error.message}`);
        await connection.query(new Query("ROLLBACK"));
        throw error;
      }
    });
  }
}

export class PoolClient {
  protected _connection: Connection;
  private _releaseCallback: () => void;

  constructor(connection: Connection, releaseCallback: () => void) {
    this._connection = connection;
    this._releaseCallback = releaseCallback;
  }

  async query(
    text: string | QueryConfig,
    // deno-lint-ignore no-explicit-any
    ...args: any[]
  ): Promise<QueryResult> {
    const query = new Query(text, ...args);
    return await this._connection.query(query);
  }

  async release(): Promise<void> {
    await this._releaseCallback();
  }
}
