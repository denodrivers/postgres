import { type Notice } from "../connection/message.ts";

/**
 * A connection error
 */
export class ConnectionError extends Error {
  /**
   * Create a new ConnectionError
   */
  constructor(message?: string) {
    super(message);
    this.name = "ConnectionError";
  }
}

/**
 * A connection params error
 */
export class ConnectionParamsError extends Error {
  /**
   * Create a new ConnectionParamsError
   */
  constructor(message: string, cause?: Error) {
    super(message, { cause });
    this.name = "ConnectionParamsError";
  }
}

/**
 * A Postgres database error
 */
export class PostgresError extends Error {
  /**
   * The fields of the notice message
   */
  public fields: Notice;

  /**
   * Create a new PostgresError
   */
  constructor(fields: Notice) {
    super(fields.message);
    this.fields = fields;
    this.name = "PostgresError";
  }
}

/**
 * A transaction error
 */
export class TransactionError extends Error {
  /**
   * Create a transaction error with a message and a cause
   */
  constructor(transaction_name: string, cause: PostgresError) {
    super(`The transaction "${transaction_name}" has been aborted`, { cause });
    this.name = "TransactionError";
  }
}
