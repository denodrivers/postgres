import type { RowDescription } from "./connection.ts";
import { encode, EncodedArg } from "./encode.ts";
import { decode } from "./decode.ts";
import { WarningFields } from "./warning.ts";

const commandTagRegexp = /^([A-Za-z]+)(?: (\d+))?(?: (\d+))?/;

type CommandType = (
  | "INSERT"
  | "DELETE"
  | "UPDATE"
  | "SELECT"
  | "MOVE"
  | "FETCH"
  | "COPY"
);

export interface QueryConfig {
  text: string;
  args?: Array<unknown>;
  name?: string;
  encoder?: (arg: unknown) => EncodedArg;
}

class QueryResult {
  // TODO
  // This should be private for real
  public _done = false;
  public command!: CommandType;
  public rowCount?: number;
  public rowDescription!: RowDescription;
  public warnings: WarningFields[] = [];

  constructor(public query: Query) {}

  /**
   * This function is required to understand the parsing
   */
  // TODO
  // Probably should be in the constructor instead
  loadColumnDescriptions(description: RowDescription) {
    this.rowDescription = description;
  }

  handleCommandComplete(commandTag: string): void {
    const match = commandTagRegexp.exec(commandTag);
    if (match) {
      this.command = match[1] as CommandType;
      if (match[3]) {
        // COMMAND OID ROWS
        this.rowCount = parseInt(match[3], 10);
      } else {
        // COMMAND ROWS
        this.rowCount = parseInt(match[2], 10);
      }
    }
  }

  done() {
    this._done = true;
  }
}

export class QueryArrayResult extends QueryResult {
  // deno-lint-ignore no-explicit-any
  public rows: any[][] = []; // actual results

  // deno-lint-ignore no-explicit-any camelcase
  private parseRowData(row_data: any[]): any[] {
    return row_data.map((raw_value, index) => {
      const column = this.rowDescription.columns[index];

      if (raw_value === null) {
        return null;
      }
      return decode(raw_value, column);
    });
  }

  // deno-lint-ignore no-explicit-any
  insertRow(row: any[]): void {
    if (this._done) {
      throw new Error("New data row, after result if done.");
    }

    const parsedRow = this.parseRowData(row);
    this.rows.push(parsedRow);
  }
}

export class QueryObjectResult extends QueryResult {
  // deno-lint-ignore no-explicit-any
  public rows: Record<string, any>[] = [];

  // deno-lint-ignore no-explicit-any camelcase
  private parseRowData(row_data: any[]): Record<string, any> {
    return row_data.reduce((row, raw_value, index) => {
      const column = this.rowDescription.columns[index];

      if (raw_value === null) {
        row[column.name] = null;
      } else {
        row[column.name] = decode(raw_value, column);
      }

      return row;
    }, {});
  }

  // deno-lint-ignore no-explicit-any
  insertRow(row: any[]): void {
    if (this._done) {
      throw new Error("New data row, after result if done.");
    }

    const parsedRow = this.parseRowData(row);
    this.rows.push(parsedRow);
  }
}

export class Query {
  public text: string;
  public args: EncodedArg[];

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
  }

  private _prepareArgs(config: QueryConfig): EncodedArg[] {
    const encodingFn = config.encoder ? config.encoder : encode;
    return (config.args || []).map(encodingFn);
  }
}
