import { encodeArgument, type EncodedArg } from "./encode.ts";
import { type Column, decode } from "./decode.ts";
import { type Notice } from "../connection/message.ts";
import { type ClientControls } from "../connection/connection_params.ts";

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
 * import { Client } from "https://deno.land/x/postgres/mod.ts";
 * const my_client = new Client();
 *
 * await my_client.queryArray("SELECT ID, NAME FROM PEOPLE WHERE AGE > $1 AND AGE < $2", [
 *   10, // $1
 *   20, // $2
 * ]);
 * ```
 */

/** Types of arguments passed to a query */
export type QueryArguments = unknown[] | Record<string, unknown>;

const commandTagRegexp = /^([A-Za-z]+)(?: (\d+))?(?: (\d+))?/;

/** Type of query to be executed */
export type CommandType =
  | "INSERT"
  | "DELETE"
  | "UPDATE"
  | "SELECT"
  | "MOVE"
  | "FETCH"
  | "COPY";

/** Type of a query result */
export enum ResultType {
  ARRAY,
  OBJECT,
}

/** Class to describe a row */
export class RowDescription {
  /** Create a new row description */
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
  args: unknown[],
  result_type: T,
): Query<T> {
  const text = template.reduce((curr, next, index) => {
    return `${curr}$${index}${next}`;
  });

  return new Query(text, result_type, args);
}

function objectQueryToQueryArgs(
  query: string,
  args: Record<string, unknown>,
): [string, unknown[]] {
  args = normalizeObjectQueryArgs(args);

  let counter = 0;
  const clean_args: unknown[] = [];
  const clean_query = query.replaceAll(/(?<=\$)\w+/g, (match) => {
    match = match.toLowerCase();
    if (match in args) {
      clean_args.push(args[match]);
    } else {
      throw new Error(
        `No value was provided for the query argument "${match}"`,
      );
    }

    return String(++counter);
  });

  return [clean_query, clean_args];
}

/** This function lowercases all the keys of the object passed to it and checks for collission names */
function normalizeObjectQueryArgs(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const normalized_args = Object.fromEntries(
    Object.entries(args).map(([key, value]) => [key.toLowerCase(), value]),
  );

  if (Object.keys(normalized_args).length !== Object.keys(args).length) {
    throw new Error(
      "The arguments provided for the query must be unique (insensitive)",
    );
  }

  return normalized_args;
}

/** Types of options  */
export interface QueryOptions {
  /** The arguments to be passed to the query */
  args?: QueryArguments;
  /** A custom function to  override the encoding logic of the arguments passed to the query */
  encoder?: (arg: unknown) => EncodedArg;
  /**The name of the query statement */
  name?: string;
  // TODO
  // Rename to query
  /** The query statement to be executed */
  text: string;
}

/** Options to control the behavior of a Query instance */
export interface QueryObjectOptions extends QueryOptions {
  // TODO
  // Support multiple case options
  /**
   * Enabling camel case will transform any snake case field names coming from the database into camel case ones
   *
   * Ex: `SELECT 1 AS my_field` will return `{ myField: 1 }`
   *
   * This won't have any effect if you explicitly set the field names with the `fields` parameter
   */
  camelCase?: boolean;
  /**
   * This parameter supersedes query column names coming from the databases in the order they were provided.
   * Fields must be unique and be in the range of (a-zA-Z0-9_), otherwise the query will throw before execution.
   * A field can not start with a number, just like JavaScript variables
   *
   * This setting overrides the camel case option
   *
   * Ex: `SELECT 'A', 'B' AS my_field` with fields `["field_1", "field_2"]` will return `{ field_1: "A", field_2: "B" }`
   */
  fields?: string[];
}

/**
 * This class is used to handle the result of a query
 */
export class QueryResult {
  /**
   * Type of query executed for this result
   */
  public command!: CommandType;
  /**
   * The amount of rows affected by the query
   */
  // TODO change to affectedRows
  public rowCount?: number;
  /**
   * This variable will be set after the class initialization, however it's required to be set
   * in order to handle result rows coming in
   */
  #row_description?: RowDescription;
  /**
   * The warnings of the result
   */
  public warnings: Notice[] = [];

  /**
   * The row description of the result
   */
  get rowDescription(): RowDescription | undefined {
    return this.#row_description;
  }

  set rowDescription(row_description: RowDescription | undefined) {
    // Prevent #row_description from being changed once set
    if (row_description && !this.#row_description) {
      this.#row_description = row_description;
    }
  }

  /**
   * Create a query result instance for the query passed
   */
  constructor(public query: Query<ResultType>) {}

  /**
   * This function is required to parse each column
   * of the results
   */
  loadColumnDescriptions(description: RowDescription) {
    this.rowDescription = description;
  }

  /**
   * Handles the command complete message
   */
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
   *
   * This function can throw on validation, so any errors must be handled in the message loop accordingly
   */
  insertRow(_row: Uint8Array[]): void {
    throw new Error("No implementation for insertRow is defined");
  }
}

/**
 * This class is used to handle the result of a query that returns an array
 */
export class QueryArrayResult<
  T extends Array<unknown> = Array<unknown>,
> extends QueryResult {
  /**
   * The result rows
   */
  public rows: T[] = [];

  /**
   * Insert a row into the result
   */
  insertRow(row_data: Uint8Array[], controls?: ClientControls) {
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
      return decode(raw_value, column, controls);
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
  return input.split("_").reduce((res, word, i) => {
    if (i !== 0) {
      word = word[0].toUpperCase() + word.slice(1);
    }

    res += word;
    return res;
  }, "");
}

/**
 * This class is used to handle the result of a query that returns an object
 */
export class QueryObjectResult<
  T = Record<string, unknown>,
> extends QueryResult {
  /**
   * The column names will be undefined on the first run of insertRow, since
   */
  public columns?: string[];
  /**
   * The rows of the result
   */
  public rows: T[] = [];

  /**
   * Insert a row into the result
   */
  insertRow(row_data: Uint8Array[], controls?: ClientControls) {
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
        if (this.query.camelCase) {
          column_names = this.rowDescription.columns.map((column) =>
            snakecaseToCamelcase(column.name)
          );
        } else {
          column_names = this.rowDescription.columns.map(
            (column) => column.name,
          );
        }

        // Check field names returned by the database are not duplicated
        const duplicates = findDuplicatesInArray(column_names);
        if (duplicates.length) {
          throw new Error(
            `Field names ${
              duplicates
                .map((str) => `"${str}"`)
                .join(", ")
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

    const row = row_data.reduce((row, raw_value, index) => {
      const current_column = this.rowDescription!.columns[index];

      if (raw_value === null) {
        row[columns[index]] = null;
      } else {
        row[columns[index]] = decode(raw_value, current_column, controls);
      }

      return row;
    }, {} as Record<string, unknown>);

    this.rows.push(row as T);
  }
}

/**
 * This class is used to handle the query to be executed by the database
 */
export class Query<T extends ResultType> {
  public args: EncodedArg[];
  public camelCase?: boolean;
  /**
   * The explicitly set fields for the query result, they have been validated beforehand
   * for duplicates and invalid names
   */
  public fields?: string[];
  // TODO
  // Should be private
  public result_type: ResultType;
  // TODO
  // Document that this text is the one sent to the database, not the original one
  public text: string;
  constructor(config: QueryObjectOptions, result_type: T);
  constructor(text: string, result_type: T, args?: QueryArguments);
  constructor(
    config_or_text: string | QueryObjectOptions,
    result_type: T,
    args: QueryArguments = [],
  ) {
    this.result_type = result_type;
    if (typeof config_or_text === "string") {
      if (!Array.isArray(args)) {
        [config_or_text, args] = objectQueryToQueryArgs(config_or_text, args);
      }

      this.text = config_or_text;
      this.args = args.map(encodeArgument);
    } else {
      const { camelCase, encoder = encodeArgument, fields } = config_or_text;
      let { args = [], text } = config_or_text;

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

      this.camelCase = camelCase;

      if (!Array.isArray(args)) {
        [text, args] = objectQueryToQueryArgs(text, args);
      }

      this.args = args.map(encoder);
      this.text = text;
    }
  }
}
