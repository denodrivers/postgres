import { readInt16BE, readInt32BE } from "./utils.ts";


export class PacketReader {
    private offset: number = 0;
    private decoder: TextDecoder = new TextDecoder();

    constructor(private buffer: Uint8Array) {}

    readInt16() {
        const value = readInt16BE(this.buffer, this.offset)
        this.offset += 2;
        return value;
    }

    readInt32() {
        const value = readInt32BE(this.buffer, this.offset)
        this.offset += 4;
        return value;
    }

    readBytes(length: number) {
        const start = this.offset;
        const end = start + length;
        const slice = this.buffer.slice(start, end);
        this.offset = end;
        return slice;
    }

    readString(length: number) {
        const bytes = this.readBytes(length)
        return this.decoder.decode(bytes);
    }

    readCString() {
        const start = this.offset;
        // find next null byte
        const end = this.buffer.indexOf(0, start);
        const slice = this.buffer.slice(start, end);
        // add +1 for null byte
        this.offset = end + 1;
        return this.decoder.decode(slice);
    }
}
