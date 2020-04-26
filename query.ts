import { RowDescription, Column, Format } from "./connection.ts";
import { Connection } from "./connection.ts";
import { encode, EncodedArg } from "./encode.ts";

import { decode } from "./decode.ts";

export interface QueryConfig {
  text: string;
  args?: Array<unknown>;
  name?: string;
  encoder?: (arg: unknown) => EncodedArg;
}

export class QueryResult {
  public rowDescription!: RowDescription;
  private _done = false;
  public rows: any[] = []; // actual results

  constructor(public query: Query) {}

  handleRowDescription(description: RowDescription) {
    this.rowDescription = description;
  }

  private _parseDataRow(dataRow: any[]): any[] {
    const parsedRow = [];

    for (let i = 0, len = dataRow.length; i < len; i++) {
      const column = this.rowDescription.columns[i];
      const rawValue = dataRow[i];

      if (rawValue === null) {
        parsedRow.push(null);
      } else {
        parsedRow.push(decode(rawValue, column));
      }
    }

    return parsedRow;
  }

  handleDataRow(dataRow: any[]): void {
    if (this._done) {
      throw new Error("New data row, after result if done.");
    }

    const parsedRow = this._parseDataRow(dataRow);
    this.rows.push(parsedRow);
  }

  rowsOfObjects() {
    return this.rows.map((row) => {
      const rv: { [key: string]: any } = {};
      this.rowDescription.columns.forEach((column, index) => {
        rv[column.name] = row[index];
      });

      return rv;
    });
  }

  done() {
    this._done = true;
  }
}

export class Query {
  public text: string;
  public args: EncodedArg[];
  public result: QueryResult;

  // TODO: can we use more specific type for args?
  constructor(text: string | QueryConfig, ...args: unknown[]) {
    let config: QueryConfig;
    if (typeof text === "string") {
      config = { text, args };
    } else {
      config = text;
    }
    this.text = config.text;
    this.args = this._prepareArgs(config);
    this.result = new QueryResult(this);
  }

  private _prepareArgs(config: QueryConfig): EncodedArg[] {
    const encodingFn = config.encoder ? config.encoder : encode;
    return (config.args || []).map(encodingFn);
  }
}
