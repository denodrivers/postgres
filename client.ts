import { Connection } from "./connection.ts";
import { ConnectionParams, IConnectionParams } from "./connection_params.ts";
import { Query, QueryConfig, QueryResult, QueryType } from "./query.ts";

export class Client {
  protected _connection: Connection;

  constructor(config?: IConnectionParams | string) {
    const connectionParams = new ConnectionParams(config);
    this._connection = new Connection(connectionParams);
  }

  async connect(): Promise<void> {
    await this._connection.startup();
    await this._connection.initSQL();
  }

  async query(
    text: string,
    config?: QueryConfig,
  ): Promise<QueryResult> {
    const query = new Query(text, config);
    return await this._connection.query(query);
  }

  async multiQuery(
    queries: string | string[] | QueryType[],
  ): Promise<QueryResult[]> {
    if (!Array.isArray(queries)) {
      queries = queries.split(";")
        .filter((el) => el.trim().length > 0)
        .map((el) => el.trim() + ";");
    }

    const parsedQueries: QueryType[] = (queries as string[])
      .map((el: string): QueryType =>
        typeof el === "string"
          ? ({ text: el })
          : el
      );

    const result: QueryResult[] = [];

    for await (const query of parsedQueries) {
      result.push(await this.query(query.text, query.config));
    }

    return result;
  }

  async end(): Promise<void> {
    await this._connection.end();
  }

  // Support `using` module
  _aenter = this.connect;
  _aexit = this.end;
}

export class PoolClient {
  protected _connection: Connection;
  private _releaseCallback: () => void;

  constructor(connection: Connection, releaseCallback: () => void) {
    this._connection = connection;
    this._releaseCallback = releaseCallback;
  }

  async query(
    text: string,
    ...args: any[]
  ): Promise<QueryResult> {
    const query = new Query(text, { args });
    return await this._connection.query(query);
  }

  async release(): Promise<void> {
    await this._releaseCallback();
  }
}
