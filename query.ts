import { RowDescription } from "./connection.ts";

export class QueryResult {
    private rowDescription: RowDescription;
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
}

export class Query {
    public text: string;
    public result: QueryResult = new QueryResult();
}
