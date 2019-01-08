import { Reader} from "deno";
import { copyBytes } from "https://deno.land/x/net/util.ts";

export function readInt16BE(buffer: Uint8Array, offset: number): number {
    offset = offset >>> 0
    const val = buffer[offset + 1] | (buffer[offset] << 8)
    return (val & 0x8000) ? val | 0xFFFF0000 : val
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

export function readUInt16BE(buffer: Uint8Array, offset: number): number {
    offset = offset >>> 0
    // console.log("offset", buffer[offset], buffer[offset +1])
    return buffer[offset] | (buffer[offset + 1] << 8)
}

export class BufferedReader {
    stream: Reader;
    buffer: Uint8Array;
    offset = 0;
    lastChunk = false;
    chunk: any = null;
    chunkLength: number = 0;
    headerSize: number = 0;
    lengthPadding: number = 0;
    header: any = null;

    constructor(options: any) {
        //TODO - remove for version 1.0
        if (typeof options == 'number') {
            options = { headerSize: options }
        }
        options = options || {}

        this.stream = options.stream;
        this.buffer = new Uint8Array(1024);

        if (options.headerSize) {
            this.headerSize = options.headerSize
        }

        if (options.lengthPadding) {
            this.lengthPadding = options.lengthPadding
        }
        
        if (this.headerSize > 1) {
            throw new Error('pre-length header of more than 1 byte length not currently supported');
        }
    }

    async readPacket() {
        const rr = await this.stream.read(this.buffer);

        if (rr.nread === this.buffer.length) {

        }
    }
    addChunk(chunk: Uint8Array) {
        if (!this.chunk || this.offset === this.chunkLength) {
            // console.log('add chunk', chunk.length, chunk.byteLength)
            this.chunk = chunk;
            this.chunkLength = chunk.length;
            this.offset = 0;
            return
        }

        var newChunkLength = chunk.length;
        var newLength = this.chunkLength + newChunkLength;

        if (newLength > this.chunk.length) {
            var newBufferLength = this.chunk.length * 2;
            while (newLength >= newBufferLength) {
                newBufferLength *= 2
            }
            var newBuffer = new Uint8Array(newBufferLength)
            this.chunk.copy(newBuffer)

            this.chunk = newBuffer
        }
        copyBytes(this.chunk, chunk, this.chunkLength);
        this.chunkLength = newLength;
    }

    read(): { header: Uint8Array, result: Uint8Array} | null {
        if (this.chunkLength < (this.headerSize + 4 + this.offset)) {
            return null;
        }

        let header = null;
        if (this.headerSize) {
            this.header = this.chunk[this.offset]
            header = this.chunk.slice(this.offset, this.offset + this.headerSize)
        }

        //read length of next item
        const length = readUInt32BE(this.chunk, this.offset + this.headerSize) + this.lengthPadding;
        if (length < 0) {
            return null;
        }
        // console.log('read length', length);

        //next item spans more chunks than we have
        var remaining = this.chunkLength - (this.offset + 4 + this.headerSize)
        if (length > remaining) {
            return null;
        }

        this.offset += (this.headerSize + 4)
        const result = this.chunk.slice(this.offset, this.offset + length)
        this.offset += length
        return { header, result };
    }
}