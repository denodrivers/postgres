import { Connection } from "./connection.ts";
import { Pool } from "./pool.ts";
import { Query, QueryConfig, QueryResult } from "./query.ts";
import { ConnectionParams, IConnectionParams } from "./connection_params.ts";

export class Client {
  protected _connection: Connection;
  private _connectionParams: ConnectionParams;
  release: () => void;

  constructor(config?: IConnectionParams | string) {
    this._connectionParams = new ConnectionParams(config);
  }

  async connect(): Promise<void> {
    this._connection = new Connection(this._connectionParams);
    await this._connection.startup();
    await this._connection.initSQL();
  }

  // TODO: can we use more specific type for args?
  async query(
    text: string | QueryConfig,
    ...args: any[]
  ): Promise<QueryResult> {
    const query = new Query(text, ...args);
    return await this._connection.query(query);
  }

  async end(): Promise<void> {
    await this._connection.end();
    delete this._connection;
  }

  // Support `using` module
  _aenter = this.connect;
  _aexit = this.end;
}

// TODO(bartlomieju) to be refactored
export class PooledClient extends Client {
  constructor(connection: Connection, release: () => void) {
    super();
    this._connection = connection;
    this.release = function() {
      release();
      delete this._connection;
      delete this.release;
    };
  }

  async connect(): Promise<void> {}

  async end(): Promise<void> {
    this.release();
  }
}
