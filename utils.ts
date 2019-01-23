export function readInt16BE(buffer: Uint8Array, offset: number): number {
    offset = offset >>> 0
    const val = buffer[offset + 1] | (buffer[offset] << 8)
    return (val & 0x8000) ? val | 0xFFFF0000 : val
}

export function readUInt16BE(buffer: Uint8Array, offset: number): number {
    offset = offset >>> 0
    return buffer[offset] | (buffer[offset + 1] << 8)
}

export function readInt32BE(buffer: Uint8Array, offset: number): number {
    offset = offset >>> 0

    return (buffer[offset] << 24) |
        (buffer[offset + 1] << 16) |
        (buffer[offset + 2] << 8) |
        (buffer[offset + 3])
}

export function readUInt32BE(buffer: Uint8Array, offset: number): number {
    offset = offset >>> 0

    return (
        buffer[offset] * 0x1000000) +
        (
            (buffer[offset + 1] << 16) |
            (buffer[offset + 2] << 8) |
            buffer[offset + 3]
        )
}

export function toPostgresArray(array: Array<any>): string {
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

export interface DsnResult {
    driver: String;
    user: String;
    password: String;
    host: String;
    port: String;
    database: String;
    params: {
        [key: string]: String,
    },
}

export function parseDsn(dsn: string): DsnResult {
    const url = new URL(dsn);

    const params = {};
    for (const [key, value] of url.searchParams.entries()) {
        params[key] = value;
    }

    return {
        driver: url.protocol.slice(0, url.protocol.length - 1),
        user: url.username,
        password: url.password,
        host: url.hostname,
        port: url.port,
        // remove leading slash from path
        database: url.pathname.slice(1),
        params,
    }
}