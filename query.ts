import { RowDescription, Column, Format } from "./connection.ts";
import { Connection } from "./connection.ts";
import { encode, EncodedArg } from "./encode.ts";
import { Oid } from "./oid.ts";

export interface QueryConfig {
    text: string;
    args?: any[];
    name?: string;
    encoder?: (arg: any) => EncodedArg,
}


function decodeBinary() {
    throw new Error("Not implemented!")
}

const decoder = new TextDecoder();

function decodeText(value: Uint8Array, column: Column) {
    const strValue = decoder.decode(value);
    
    switch (column.typeOid) {
        case Oid.char:
        case Oid.varchar:
        case Oid.text:
            return strValue;
        case Oid.bool:
            return strValue[0] === "t";
        case Oid.int2:
        case Oid.int4:
        case Oid.int8:
            return parseInt(strValue, 10);
        case Oid.float4:
        case Oid.float8:
            return parseFloat(strValue);
        case Oid.timestamptz:
        case Oid.timestamp:
        case Oid.date:
        case Oid.time:
        case Oid.timetz:
        default: 
         throw new Error(`Don't know how to parse column type: ${column.typeOid}`);
    }
}

function decode(value: Uint8Array, column: Column) {
    if (column.format === Format.BINARY) {
        return decodeBinary();
    } else if (column.format === Format.TEXT) {
        return decodeText(value, column);
    } else {
        throw new Error(`Unknown column format: ${column.format}`);
    }
}

export class QueryResult {
    private rowDescription: RowDescription;
    private _done = false;
    public rows: any[] = []; // actual results

    constructor(public query: Query) {}

    handleRowDescription(description: RowDescription) {
        this.rowDescription = description;
    }

    private _parseDataRow(dataRow: any[]): any[] {
        const parsedRow = [];

        for (let i = 0, len = dataRow.length; i < len; i++) {
            const column = this.rowDescription.columns[i];
            const rawValue = dataRow[i];

            if (rawValue === null) {
                parsedRow.push(null);
            } else {
                // TODO: parse properly
                const parsedValue = decode(rawValue, column);
                parsedRow.push(parsedValue)
            }
        }

        return parsedRow;
    }

    handleDataRow(dataRow: any[]): void {
        if (this._done) {
            throw new Error("New data row, after result if done.");
        }
        
        const parsedRow = this._parseDataRow(dataRow);
        this.rows.push(parsedRow);
    }

    rowsOfObjects() {
        return this.rows.map((row, index) => {
            const rv: {[key: string]: any} = {};
            this.rowDescription.columns.forEach(column => {
                rv[column.name] = row[index];
            })
            
            return rv;
        })
    }

    done() {
        this._done = true;
    }
}

export class Query {
    public text: string;
    public args: EncodedArg[];
    public result: QueryResult;

    constructor(public connection: Connection, config: QueryConfig) {
        this.text = config.text;
<<<<<<< HEAD
        this.args = this._prepareArgs(config);
        this.result = new QueryResult();
=======
        this.args = this.prepareArgs(config.args);
        this.result = new QueryResult(this);
>>>>>>> first pass at decoding data rows
    }

    private _prepareArgs(config: QueryConfig): EncodedArg[] {
        const encodingFn = config.encoder ? config.encoder : encode;
        return config.args.map(encodingFn);
    }

    async execute(): Promise<QueryResult> {
        return await this.connection.query(this);
    }
}
