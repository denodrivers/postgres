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

class _QueryResult {
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

export class QueryResult extends _QueryResult {
  // deno-lint-ignore no-explicit-any
  public rows: any[] = []; // actual results

  // deno-lint-ignore no-explicit-any
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

  // deno-lint-ignore no-explicit-any
  handleDataRow(dataRow: any[]): void {
    if (this._done) {
      throw new Error("New data row, after result if done.");
    }

    const parsedRow = this._parseDataRow(dataRow);
    this.rows.push(parsedRow);
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

  rowsOfObjects() {
    return this.rows.map((row) => {
      // deno-lint-ignore no-explicit-any
      const rv: { [key: string]: any } = {};
      this.rowDescription.columns.forEach((column, index) => {
        rv[column.name] = row[index];
      });

      return rv;
    });
  }
}

export class ObjectQueryResult {
  private _done = false;
  public command!: CommandType;
  public rowCount?: number;
  public rowDescription!: RowDescription;
  // deno-lint-ignore no-explicit-any
  public rows: any[] = []; // actual results
  public warnings: WarningFields[] = [];

  constructor(public query: Query) {}

  handleRowDescription(description: RowDescription) {
    this.rowDescription = description;
  }

  // deno-lint-ignore no-explicit-any
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

  // deno-lint-ignore no-explicit-any
  handleDataRow(dataRow: any[]): void {
    if (this._done) {
      throw new Error("New data row, after result if done.");
    }

    const parsedRow = this._parseDataRow(dataRow);
    this.rows.push(parsedRow);
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

  rowsOfObjects() {
    return this.rows.map((row) => {
      // deno-lint-ignore no-explicit-any
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
