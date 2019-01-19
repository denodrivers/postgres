import { RowDescription } from "./connection.ts";
import { Connection } from "./connection.ts";
import { toPostgresArray } from "./utils.ts";

export interface QueryConfig {
    text: string;
    args?: any[];
    name?: string;
}

export class QueryResult {
    private rowDescription: RowDescription;
    private _done = false;
    public rows: any[] = []; // actual results

    handleRowDescription(description: RowDescription) {
        this.rowDescription = description;
    }

    private _parseDataRow(dataRow: any[]): any[] {
        const parsedRow = [];

        for (let i = 0, len = dataRow.length; i < len; i++) {
            const rawValue = dataRow[i];
            if (rawValue === null) {
                parsedRow.push(null);
            } else {
                // TODO: parse properly
                const parsedValue = rawValue;
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
    public args: Array<string|Uint8Array>;
    public result: QueryResult;

    constructor(public connection: Connection, config: QueryConfig) {
        this.text = config.text;
        this.args = this.prepareArgs(config.args);
        this.result = new QueryResult();
    }

    prepareArgs(args: any[]): Array<string | Uint8Array> {
        // stringify all args
        return args.map(arg => {
            if (arg === null || typeof arg === "undefined") {
                return null;
            } else if (arg instanceof Uint8Array) {
                return arg;
            } else if (arg instanceof Date) {
                return arg.toISOString();
            } else if (arg instanceof Array) {
                return toPostgresArray(arg);
            } else if (arg instanceof Object) {
                return JSON.stringify(arg);
            } else {
                return arg.toString();
            }
        });
    }

    async execute(): Promise<QueryResult> {
        return await this.connection.query(this);
    }
}
