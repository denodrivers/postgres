import { ConnectionPool } from "./pool.ts";
import { Query, QueryConfig, QueryResult } from "./query.ts";
import { IConnectionParams, ConnectionParams } from "./connection_params.ts";

export class Client {
  pool: ConnectionPool;

  constructor(config?: IConnectionParams | string, poolSize: number = 1) {
    const connectionParams = new ConnectionParams(config);
    this.pool = new ConnectionPool(connectionParams, poolSize);
  }

  async connect() {
    await this.pool.startup();
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

  get availableConnections() {
    return this.pool.available;
  }
}
