import { Message } from "./connection.ts";

// TODO: this should probably be extension of Error
export interface PostgresError {
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

export function parseError(msg: Message): PostgresError {
    const error: any = {};

    let byte: number;
    let char: string;
    let errorMsg: string;

    while (byte = msg.reader.readByte()) {
        char = String.fromCharCode(byte);
        errorMsg = msg.reader.readCString();

        switch (char) {
            case "S":
                error.severity = errorMsg;
                break;
            case "C":
                error.code = errorMsg
                break;
            case "M":
                error.message = errorMsg;
                break;
            case "D":
                error.detail = errorMsg;
                break;
            case "H":
                error.hint = errorMsg;
                break;
            case "P":
                error.position = errorMsg;
                break;
            case "p":
                error.internalPosition = errorMsg;
                break;
            case "q":
                error.internalQuery = errorMsg;
                break;
            case "W":
                error.where = errorMsg;
                break;
            case "s":
                error.schema = errorMsg;
                break;
            case "t":
                error.table = errorMsg;
                break;
            case "c":
                error.column = errorMsg;
                break;
            case "d":
                error.dataTypeName = errorMsg;
                break;
            case "n":
                error.constraint = errorMsg;
                break;
            case "F":
                error.file = errorMsg;
                break;
            case "L":
                error.line = errorMsg;
                break;
            case "R":
                error.routine = errorMsg;
                break;
            default:
                // from Postgres docs
                // > Since more field types might be added in future, 
                // > frontends should silently ignore fields of unrecognized type.
                break;
        }
    }

    return error as PostgresError;
}