// Based on https://github.com/brianc/node-buffer-writer
// License MIT

// Copied from deno_std
// `off` is the offset into `dst` where it will at which to begin writing values
// from `src`.
// Returns the number of bytes copied.
export function copyBytes(dst: Uint8Array, src: Uint8Array, off = 0): number {
    const r = dst.byteLength - off;
    if (src.byteLength > r) {
        src = src.subarray(0, r);
    }
    dst.set(src, off);
    return src.byteLength;
}

export class PacketWriter {
    private size: number;
    private buffer: Uint8Array;
    private offset: number;
    private headerPosition: number;

    constructor(size?: number) {
        this.size = size || 1024;
        this.buffer = new Uint8Array(this.size + 5);
        this.offset = 5;
        this.headerPosition = 0;
    }

    _ensure(size: number) {
        const remaining = this.buffer.length - this.offset;
        if (remaining < size) {
            const oldBuffer = this.buffer;
            // exponential growth factor of around ~ 1.5
            // https://stackoverflow.com/questions/2269063/buffer-growth-strategy
            const newSize = oldBuffer.length + (oldBuffer.length >> 1) + size;
            this.buffer = new Uint8Array(newSize);
            copyBytes(this.buffer, oldBuffer);
        }
    }

    addInt32(num: number) {
        this._ensure(4);
        this.buffer[this.offset++] = (num >>> 24 & 0xFF);
        this.buffer[this.offset++] = (num >>> 16 & 0xFF);
        this.buffer[this.offset++] = (num >>> 8 & 0xFF);
        this.buffer[this.offset++] = (num >>> 0 & 0xFF);
        return this;
    }

    addInt16(num: number) {
        this._ensure(2);
        this.buffer[this.offset++] = (num >>> 8 & 0xFF);
        this.buffer[this.offset++] = (num >>> 0 & 0xFF);
        return this;
    }

    addCString(string?: string) {
        //just write a 0 for empty or null strings
        if (!string) {
            this._ensure(1);
        } else {
            const len = byteLength(string);
            this._ensure(len + 1); //+1 for null terminator
            writeString(this.buffer, string, this.offset);
            this.offset += len;
        }

        this.buffer[this.offset++] = 0; // null terminator
        // console.log('post c string', this.offset);
        return this;
    }

    addChar(c: string) {
        this._ensure(1);
        writeString(this.buffer, c, this.offset);
        this.offset++;
        return this;
    }


    addString(string?: string) {
        string = string || "";
        const len = byteLength(string);
        this._ensure(len);
        copyBytes(this.buffer, encoder.encode(string), this.offset)
        this.offset += len;
        return this;
    };

    getByteLength() {
        return this.offset - 5;
    };

    add(otherBuffer: Uint8Array) {
        this._ensure(otherBuffer.length);
        copyBytes(this.buffer, otherBuffer, this.offset);
        this.offset += otherBuffer.length;
        // console.log('pre join', this.offset, this.size, this.headerPosition);
        return this;
    };

    clear() {
        this.offset = 5;
        this.headerPosition = 0;
    };

    //appends a header block to all the written data since the last
    //subsequent header or to the beginning if there is only one data block
    addHeader(code: number, last?: boolean) {
        const origOffset = this.offset;
        this.offset = this.headerPosition;
        this.buffer[this.offset++] = code;
        //length is everything in this packet minus the code
        this.addInt32(origOffset - (this.headerPosition + 1));
        //set next header position
        this.headerPosition = origOffset;
        //make space for next header
        this.offset = origOffset;
        if (!last) {
            this._ensure(5);
            this.offset += 5;
        }
        return this;
    };

    join(code?: number) {
        if (code) {
            this.addHeader(code, true);
        }
        return this.buffer.slice(code ? 0 : 5, this.offset);
    };

    flush(code?: number) {
        const result = this.join(code);
        this.clear();
        // console.log('flush result', this.offset, this.headerPosition, this.size);
        // console.log('decoded', new TextDecoder().decode(result));
        return result;
    };
}

const encoder = new TextEncoder();
function writeString(buffer: Uint8Array, string: string, offset: number) {
    // console.log('write string', string, offset, encoder.encode(string));
    copyBytes(buffer, encoder.encode(string), offset);
};

function byteLength(str: string) {
    return encoder.encode(str).byteLength;
}

