import type { Notice } from "../connection/message.ts";

export class ConnectionError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "ConnectionError";
  }
}

export class ConnectionParamsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionParamsError";
  }
}

export class PostgresError extends Error {
  public fields: Notice;

  constructor(fields: Notice) {
    super(fields.message);
    this.fields = fields;
    this.name = "PostgresError";
  }
}

// TODO
// Use error cause once it's added to JavaScript
export class TransactionError extends Error {
  constructor(
    transaction_name: string,
    public cause: PostgresError,
  ) {
    super(
      `The transaction "${transaction_name}" has been aborted due to \`${cause}\`. Check the "cause" property to get more details`,
    );
    this.name = "TransactionError";
  }
}
