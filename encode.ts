function toPostgresArray(array: Array<any>): string {
    let postgresArray = "{";

    array.forEach((element, index) => {
        if (index > 0) {
            postgresArray += ",";
        }

        if (!element) {
            postgresArray += "NULL";
        } else {
            // TODO: handles only primitive types
            postgresArray += element.toString();
        }
    })

    postgresArray += "}";
    return postgresArray;
}

export type EncodedArg = null | string | Uint8Array;

export function encode(value: any): EncodedArg {
    if (value === null || typeof value === "undefined") {
        return null;
    } else if (value instanceof Uint8Array) {
        return value;
    } else if (value instanceof Date) {
        return value.toISOString();
    } else if (value instanceof Array) {
        return toPostgresArray(value);
    } else if (value instanceof Object) {
        return JSON.stringify(value);
    } else {
        return value.toString();
    }
}