import { dial } from "deno";
import { Connection } from "./connection.ts";
import { ConnectionPool } from "./pool.ts";
import { Query, QueryConfig, QueryResult } from "./query.ts";
import { IConnectionParams, ConnectionParams } from "./connection_params.ts";

export class Client {
  pool: ConnectionPool;
  connectionParams: ConnectionParams;

  constructor(config?: IConnectionParams | string, poolSize: number = 1) {
    this.connectionParams = new ConnectionParams(config);
    this.pool = new ConnectionPool(() => this.connection(), poolSize);
  }

  async connect() {
    await this.pool.startup();
  }

  private async connection(): Promise<Connection> {
    const { host, port } = this.connectionParams;
    let addr = `${host}:${port}`;

    const conn = await dial("tcp", addr);
    const connection = new Connection(conn, this.connectionParams);

    await connection.startup({ ...this.connectionParams });
    await connection.initSQL();
    return connection;
  }

  // TODO: can we use more specific type for args?
  async query(
    text: string | QueryConfig,
    ...args: any[]
  ): Promise<QueryResult> {
    let config: QueryConfig;

    if (typeof text === "string") {
      config = { text, args };
    } else {
      config = text;
    }
    const query = new Query(config);
    return await this.pool.execute(query);
  }

  async end(): Promise<void> {
    await this.pool.end();
  }

  get availableConnection() {
    return this.pool.available;
  }
}
