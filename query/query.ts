import { encode, EncodedArg } from "./encode.ts";
import { Column, decode } from "./decode.ts";
import { Notice } from "../connection/message.ts";

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

export enum ResultType {
  ARRAY,
  OBJECT,
}

export class RowDescription {
  constructor(public columnCount: number, public columns: Column[]) {}
}

/**
 * This function transforms template string arguments into a query
 *
 * ```ts
 * ["SELECT NAME FROM TABLE WHERE ID = ", " AND DATE < "]
 * // "SELECT NAME FROM TABLE WHERE ID = $1 AND DATE < $2"
 * ```
 */
export function templateStringToQuery<T extends ResultType>(
  template: TemplateStringsArray,
  args: QueryArguments,
  result_type: T,
): Query<T> {
  const text = template.reduce((curr, next, index) => {
    return `${curr}$${index}${next}`;
  });

  return new Query(text, result_type, ...args);
}

export interface QueryConfig {
  args?: Array<unknown>;
  encoder?: (arg: unknown) => EncodedArg;
  name?: string;
  // TODO
  // Rename to query
  text: string;
}

// TODO
// Support multiple case options
export interface QueryObjectConfig extends QueryConfig {
  /**
   * Enabling camelcase will transform any snake case field names coming from the database into camel case ones
   *
   * Ex: `SELECT 1 AS my_field` will return `{ myField: 1 }`
   *
   * This won't have any effect if you explicitly set the field names with the `fields` parameter
   */
  camelcase?: boolean;
  /**
   * This parameter supersedes query column names coming from the databases in the order they were provided.
   * Fields must be unique and be in the range of (a-zA-Z0-9_), otherwise the query will throw before execution.
   * A field can not start with a number, just like JavaScript variables
   *
   * This setting overrides the camelcase option
   *
   * Ex: `SELECT 'A', 'B' AS my_field` with fields `["field_1", "field_2"]` will return `{ field_1: "A", field_2: "B" }`
   */
  fields?: string[];
}

// TODO
// Limit the type of parameters that can be passed
// to a query
/**
 * https://www.postgresql.org/docs/14/sql-prepare.html
 *
 * This arguments will be appended to the prepared statement passed
 * as query
 *
 * They will take the position according to the order in which they were provided
 *
 * ```ts
 * await my_client.queryArray(
 *  "SELECT ID, NAME FROM PEOPLE WHERE AGE > $1 AND AGE < $2",
 *  10, // $1
 *  20, // $2
 * );
 * ```
 */
// deno-lint-ignore no-explicit-any
export type QueryArguments = any[];

export class QueryResult {
  public command!: CommandType;
  public rowCount?: number;
  /**
   * This variable will be set after the class initialization, however it's required to be set
   * in order to handle result rows coming in
   */
  #row_description?: RowDescription;
  public warnings: Notice[] = [];

  get rowDescription() {
    return this.#row_description;
  }

  set rowDescription(row_description: RowDescription | undefined) {
    // Prevent #row_description from being changed once set
    if (row_description && !this.#row_description) {
      this.#row_description = row_description;
    }
  }

  constructor(public query: Query<ResultType>) {}

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

  /**
   * Add a row to the result based on metadata provided by `rowDescription`
   * This implementation depends on row description not being modified after initialization
   */
  insertRow(_row: Uint8Array[]): void {
    throw new Error("No implementation for insertRow is defined");
  }
}

export class QueryArrayResult<T extends Array<unknown> = Array<unknown>>
  extends QueryResult {
  public rows: T[] = [];

  insertRow(row_data: Uint8Array[]) {
    if (!this.rowDescription) {
      throw new Error(
        "The row descriptions required to parse the result data weren't initialized",
      );
    }

    // Row description won't be modified after initialization
    const row = row_data.map((raw_value, index) => {
      const column = this.rowDescription!.columns[index];

      if (raw_value === null) {
        return null;
      }
      return decode(raw_value, column);
    }) as T;

    this.rows.push(row);
  }
}

function findDuplicatesInArray(array: string[]): string[] {
  return array.reduce((duplicates, item, index) => {
    const is_duplicate = array.indexOf(item) !== index;
    if (is_duplicate && !duplicates.includes(item)) {
      duplicates.push(item);
    }

    return duplicates;
  }, [] as string[]);
}

function snakecaseToCamelcase(input: string) {
  return input
    .split("_")
    .reduce(
      (res, word, i) => {
        if (i !== 0) {
          word = word[0].toUpperCase() + word.slice(1);
        }

        res += word;
        return res;
      },
      "",
    );
}

export class QueryObjectResult<
  T = Record<string, unknown>,
> extends QueryResult {
  /**
   * The column names will be undefined on the first run of insertRow, since
   */
  public columns?: string[];
  public rows: T[] = [];

  insertRow(row_data: Uint8Array[]) {
    if (!this.rowDescription) {
      throw new Error(
        "The row description required to parse the result data wasn't initialized",
      );
    }

    // This will only run on the first iteration after row descriptions have been set
    if (!this.columns) {
      if (this.query.fields) {
        if (this.rowDescription.columns.length !== this.query.fields.length) {
          throw new RangeError(
            "The fields provided for the query don't match the ones returned as a result " +
              `(${this.rowDescription.columns.length} expected, ${this.query.fields.length} received)`,
          );
        }

        this.columns = this.query.fields;
      } else {
        let column_names: string[];
        if (this.query.camelcase) {
          column_names = this.rowDescription.columns.map((column) =>
            snakecaseToCamelcase(column.name)
          );
        } else {
          column_names = this.rowDescription.columns.map((column) =>
            column.name
          );
        }

        // Check field names returned by the database are not duplicated
        const duplicates = findDuplicatesInArray(column_names);
        if (duplicates.length) {
          throw new Error(
            `Field names ${
              duplicates.map((str) => `"${str}"`).join(", ")
            } are duplicated in the result of the query`,
          );
        }

        this.columns = column_names;
      }
    }

    // It's safe to assert columns as defined from now on
    const columns = this.columns!;

    if (columns.length !== row_data.length) {
      throw new RangeError(
        "The result fields returned by the database don't match the defined structure of the result",
      );
    }

    const row = row_data.reduce(
      (row, raw_value, index) => {
        const current_column = this.rowDescription!.columns[index];

        if (raw_value === null) {
          row[columns[index]] = null;
        } else {
          row[columns[index]] = decode(raw_value, current_column);
        }

        return row;
      },
      {} as Record<string, unknown>,
    );

    this.rows.push(row as T);
  }
}

export class Query<T extends ResultType> {
  public args: EncodedArg[];
  public camelcase?: boolean;
  /**
   * The explicitly set fields for the query result, they have been validated beforehand
   * for duplicates and invalid names
   */
  public fields?: string[];
  public result_type: ResultType;
  public text: string;
  constructor(config: QueryObjectConfig, result_type: T);
  constructor(text: string, result_type: T, ...args: unknown[]);
  constructor(
    config_or_text: string | QueryObjectConfig,
    result_type: T,
    ...args: unknown[]
  ) {
    this.result_type = result_type;

    let config: QueryConfig;
    if (typeof config_or_text === "string") {
      config = { text: config_or_text, args };
    } else {
      const {
        fields,
        camelcase,
        ...query_config
      } = config_or_text;

      // Check that the fields passed are valid and can be used to map
      // the result of the query
      if (fields) {
        const fields_are_clean = fields.every((field) =>
          /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)
        );
        if (!fields_are_clean) {
          throw new TypeError(
            "The fields provided for the query must contain only letters and underscores",
          );
        }

        if (new Set(fields).size !== fields.length) {
          throw new TypeError(
            "The fields provided for the query must be unique",
          );
        }

        this.fields = fields;
      }

      this.camelcase = camelcase;
      config = query_config;
    }
    this.text = config.text;
    this.args = this.#prepareArgs(config);
  }

  #prepareArgs(config: QueryConfig): EncodedArg[] {
    const encodingFn = config.encoder ? config.encoder : encode;
    return (config.args || []).map(encodingFn);
  }
}
