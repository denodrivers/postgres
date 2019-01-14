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
