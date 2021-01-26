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

export interface QueryObjectConfig extends QueryConfig {
  /**
   * This parameter superseeds query column names
   * 
   * When specified, this names will be asigned to the results
   * of the query in the order they were provided
   * 
   * Fields must be unique (case is not taken into consideration)
   */
  fields?: string[];
}

class QueryResult {
  // TODO
  // This should be private for real
  public _done = false;
  public command!: CommandType;
  public rowCount?: number;
  public rowDescription?: RowDescription;
  public warnings: WarningFields[] = [];

  constructor(public query: Query) {}

  /**
   * This function is required to parse each column
   * of the results
   */
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
  private parseRowData(row_data: Uint8Array[]): any[] {
    if (!this.rowDescription) {
      throw new Error(
        "The row descriptions required to parse the result data weren't initialized",
      );
    }

    // Row description won't be modified after initialization
    return row_data.map((raw_value, index) => {
      const column = this.rowDescription!.columns[index];

      if (raw_value === null) {
        return null;
      }
      return decode(raw_value, column);
    });
  }

  insertRow(row: Uint8Array[]): void {
    if (this._done) {
      throw new Error(
        "Tried to add a new row to the result after the result is done reading",
      );
    }

    const parsedRow = this.parseRowData(row);
    this.rows.push(parsedRow);
  }
}

export class QueryObjectResult extends QueryResult {
  // deno-lint-ignore no-explicit-any
  public rows: Record<string, any>[] = [];

  // deno-lint-ignore camelcase
  private parseRowData(row_data: Uint8Array[]) {
    if (!this.rowDescription) {
      throw new Error(
        "The row descriptions required to parse the result data weren't initialized",
      );
    }

    if (
      this.query.fields &&
      this.rowDescription.columns.length !== this.query.fields.length
    ) {
      throw new RangeError(
        "The fields provided for the query don't match the ones returned as a result " +
          `(${this.rowDescription.columns.length} expected, ${this.query.fields.length} received)`,
      );
    }

    // Row description won't be modified after initialization
    return row_data.reduce((row, raw_value, index) => {
      const column = this.rowDescription!.columns[index];

      // Find the field name provided by the user
      // default to database provided name
      const name = this.query.fields?.[index] ?? column.name;

      if (raw_value === null) {
        row[name] = null;
      } else {
        row[name] = decode(raw_value, column);
      }

      return row;
      // deno-lint-ignore no-explicit-any
    }, {} as Record<string, any>);
  }

  insertRow(row: Uint8Array[]): void {
    if (this._done) {
      throw new Error(
        "Tried to add a new row to the result after the result is done reading",
      );
    }

    const parsedRow = this.parseRowData(row);
    this.rows.push(parsedRow);
  }
}

export class Query {
  public text: string;
  public args: EncodedArg[];
  public fields?: string[];

  constructor(config: QueryObjectConfig);
  constructor(text: string, ...args: unknown[]);
  //deno-lint-ignore camelcase
  constructor(config_or_text: string | QueryObjectConfig, ...args: unknown[]) {
    let config: QueryConfig;
    if (typeof config_or_text === "string") {
      config = { text: config_or_text, args };
    } else {
      const {
        fields,
        //deno-lint-ignore camelcase
        ...query_config
      } = config_or_text;

      config = query_config;

      if (fields) {
        //deno-lint-ignore camelcase
        const clean_fields = fields.map((field) =>
          field.toString().toLowerCase()
        );

        if ((new Set(clean_fields)).size !== clean_fields.length) {
          throw new TypeError(
            "The fields provided for the query must be unique",
          );
        }

        this.fields = clean_fields;
      }
    }
    this.text = config.text;
    this.args = this._prepareArgs(config);
  }

  private _prepareArgs(config: QueryConfig): EncodedArg[] {
    const encodingFn = config.encoder ? config.encoder : encode;
    return (config.args || []).map(encodingFn);
  }
}
