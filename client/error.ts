import { type Notice } from "../connection/message.ts";

export class ConnectionError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "ConnectionError";
  }
}

export class ConnectionParamsError extends Error {
  constructor(message: string, cause?: Error) {
    super(message, { cause });
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

export class TransactionError extends Error {
  constructor(
    transaction_name: string,
    cause: PostgresError,
  ) {
    super(
      `The transaction "${transaction_name}" has been aborted`,
      { cause },
    );
    this.name = "TransactionError";
  }
}
