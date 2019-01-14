import { Message } from "./connection.ts";

export interface ErrorFields {
    severity: string;
    code: string;
    message: string;
    detail?: string;
    hint?: string;
    position?: string;
    internalPosition?: string;
    internalQuery?: string;
    where?: string;
    schemaName?: string;
    table?: string;
    column?: string;
    dataType?: string;
    contraint?: string;
    file?: string;
    line?: string;
    routine?: string;
}

export class PostgresError extends Error {
    public fields: ErrorFields;

    constructor(fields: ErrorFields) {
        super(fields.message);
        this.fields = fields;
        this.name = "PostgresError";
    }
}

const TOKEN_TO_FIELD_NAME = {
    "S": "severity",
    "C": "code",
    "M": "message",
    "D": "detail",
    "H": "hint",
    "P": "position",
    "p": "internalPosition",
    "q": "internalQuery",
    "W": "where",
    "s": "schema",
    "t": "table",
    "c": "column",
    "d": "dataType",
    "n": "constraint",
    "F": "file",
    "L": "line",
    "R": "routine",
}

export function parseError(msg: Message): PostgresError {
    // https://www.postgresql.org/docs/current/protocol-error-fields.html
    const errorFields: any = {};

    let byte: number;
    let char: string;
    let errorMsg: string;

    while (byte = msg.reader.readByte()) {
        char = String.fromCharCode(byte);
        errorMsg = msg.reader.readCString();

        switch (char) {
            case "S":
                errorFields.severity = errorMsg;
                break;
            case "C":
                errorFields.code = errorMsg
                break;
            case "M":
                errorFields.message = errorMsg;
                break;
            case "D":
                errorFields.detail = errorMsg;
                break;
            case "H":
                errorFields.hint = errorMsg;
                break;
            case "P":
                errorFields.position = errorMsg;
                break;
            case "p":
                errorFields.internalPosition = errorMsg;
                break;
            case "q":
                errorFields.internalQuery = errorMsg;
                break;
            case "W":
                errorFields.where = errorMsg;
                break;
            case "s":
                errorFields.schema = errorMsg;
                break;
            case "t":
                errorFields.table = errorMsg;
                break;
            case "c":
                errorFields.column = errorMsg;
                break;
            case "d":
                errorFields.dataTypeName = errorMsg;
                break;
            case "n":
                errorFields.constraint = errorMsg;
                break;
            case "F":
                errorFields.file = errorMsg;
                break;
            case "L":
                errorFields.line = errorMsg;
                break;
            case "R":
                errorFields.routine = errorMsg;
                break;
            default:
                // from Postgres docs
                // > Since more field types might be added in future, 
                // > frontends should silently ignore fields of unrecognized type.
                break;
        }
    }

    return new PostgresError(errorFields);
}