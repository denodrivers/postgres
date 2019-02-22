import { dial } from "deno";
import { Connection } from "./connection.ts";
import { Query, QueryConfig, QueryResult } from "./query.ts";
import { IConnectionParams, ConnectionParams } from "./connection_params.ts";

export class Client {
  connection: Connection;
  connectionParams: ConnectionParams;

  constructor(config?: IConnectionParams | string) {
    this.connectionParams = new ConnectionParams(config);
  }

  async connect() {
    const { host, port } = this.connectionParams;
    let addr = `${host}:${port}`;

    const conn = await dial("tcp", addr);
    this.connection = new Connection(conn, this.connectionParams);

    await this.connection.startup({ ...this.connectionParams });
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
    const query = new Query(this.connection, config);

    return await query.execute();
  }

  async end(): Promise<void> {
    await this.connection.end();
  }
}
