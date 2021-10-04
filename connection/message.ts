import { Column } from "../query/decode.ts";
import { PacketReader } from "./packet.ts";
import { RowDescription } from "../query/query.ts";

export class Message {
  public reader: PacketReader;

  constructor(
    public type: string,
    public byteCount: number,
    public body: Uint8Array,
  ) {
    this.reader = new PacketReader(body);
  }
}

export interface Notice {
  severity: string;
  code: string;
  message: string;
  detail?: string;
  hint?: string;
  position?: string;
  internalPosition?: string;
  internalQuery?: string;
  where?: string;
  schema?: string;
  table?: string;
  column?: string;
  dataType?: string;
  constraint?: string;
  file?: string;
  line?: string;
  routine?: string;
}

export function parseBackendKeyMessage(
  message: Message,
): { pid: number; secret_key: number } {
  return {
    pid: message.reader.readInt32(),
    secret_key: message.reader.readInt32(),
  };
}

/**
 * This function returns the command result tag from the command message
 */
export function parseCommandCompleteMessage(message: Message): string {
  return message.reader.readString(message.byteCount);
}

/**
 * https://www.postgresql.org/docs/14/protocol-error-fields.html
 */
export function parseNoticeMessage(message: Message): Notice {
  // deno-lint-ignore no-explicit-any
  const error_fields: any = {};

  let byte: number;
  let field_code: string;
  let field_value: string;

  while ((byte = message.reader.readByte())) {
    field_code = String.fromCharCode(byte);
    field_value = message.reader.readCString();

    switch (field_code) {
      case "S":
        error_fields.severity = field_value;
        break;
      case "C":
        error_fields.code = field_value;
        break;
      case "M":
        error_fields.message = field_value;
        break;
      case "D":
        error_fields.detail = field_value;
        break;
      case "H":
        error_fields.hint = field_value;
        break;
      case "P":
        error_fields.position = field_value;
        break;
      case "p":
        error_fields.internalPosition = field_value;
        break;
      case "q":
        error_fields.internalQuery = field_value;
        break;
      case "W":
        error_fields.where = field_value;
        break;
      case "s":
        error_fields.schema = field_value;
        break;
      case "t":
        error_fields.table = field_value;
        break;
      case "c":
        error_fields.column = field_value;
        break;
      case "d":
        error_fields.dataTypeName = field_value;
        break;
      case "n":
        error_fields.constraint = field_value;
        break;
      case "F":
        error_fields.file = field_value;
        break;
      case "L":
        error_fields.line = field_value;
        break;
      case "R":
        error_fields.routine = field_value;
        break;
      default:
        // from Postgres docs
        // > Since more field types might be added in future,
        // > frontends should silently ignore fields of unrecognized type.
        break;
    }
  }

  return error_fields;
}

/**
 * Parses a row data message into an array of bytes ready to be processed as column values
 */
// TODO
// Research corner cases where parseRowData can return null values
// deno-lint-ignore no-explicit-any
export function parseRowDataMessage(message: Message): any[] {
  const field_count = message.reader.readInt16();
  const row = [];

  for (let i = 0; i < field_count; i++) {
    const col_length = message.reader.readInt32();

    if (col_length == -1) {
      row.push(null);
      continue;
    }

    // reading raw bytes here, they will be properly parsed later
    row.push(message.reader.readBytes(col_length));
  }

  return row;
}

export function parseRowDescriptionMessage(message: Message): RowDescription {
  const column_count = message.reader.readInt16();
  const columns = [];

  for (let i = 0; i < column_count; i++) {
    // TODO: if one of columns has 'format' == 'binary',
    // all of them will be in same format?
    const column = new Column(
      message.reader.readCString(), // name
      message.reader.readInt32(), // tableOid
      message.reader.readInt16(), // index
      message.reader.readInt32(), // dataTypeOid
      message.reader.readInt16(), // column
      message.reader.readInt32(), // typeModifier
      message.reader.readInt16(), // format
    );
    columns.push(column);
  }

  return new RowDescription(column_count, columns);
}
