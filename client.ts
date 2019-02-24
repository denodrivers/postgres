import { dial } from "deno";
import { Connection } from "./connection.ts";
import { Pool } from "./pool.ts";
import { Query, QueryConfig, QueryResult } from "./query.ts";
import { ConnectionParams, IConnectionParams } from "./connection_params.ts";

export class Client {
  private _connection: Connection;
  private _connectionParams: ConnectionParams;
  release: () => void;

  constructor(
    config?: IConnectionParams | string | Connection,
    release?: () => void
  ) {
    if (config instanceof Connection) {
      this._connection = config;
      this.release = function() {
        release();
        delete this._connection;
        delete this.release;
      };
    } else {
      this._connectionParams = new ConnectionParams(config);
    }
  }

  private async newConnection(connectionParams: ConnectionParams) {
    const { host, port } = connectionParams;
    let addr = `${host}:${port}`;

    const conn = await dial("tcp", addr);
    const connection = new Connection(conn, connectionParams);

    await connection.startup({ ...connectionParams });
    await connection.initSQL();
    return connection;
  }

  async connect(): Promise<void> {
    if (this._connection === undefined) {
      this._connection = await this.newConnection(this._connectionParams);
    }
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
    if (this.release === undefined) {
      await this._connection.end();
      delete this._connection;
    } else {
      this.release();
    }
  }

  // Support `using` module
  _aenter = this.connect;
  _aexit = this.end;
}
