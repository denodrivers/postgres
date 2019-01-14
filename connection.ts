import { Reader, Writer } from "deno";
import { BufReader, BufWriter } from "https://deno.land/x/net/bufio.ts";
import { PacketWriter } from "./packet_writer.ts";
import { readUInt32BE, readInt32BE, readInt16BE, readUInt16BE } from "./utils.ts";
import { PacketReader } from "./packet_reader.ts";
import { QueryResult } from "./query.ts";


export interface ConnectionParams {
    database?: string;
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    application_name?: string;
}

enum Format {
    TEXT = 0,
    BINARY = 1,
}

export class Message {
    constructor(
        public type: string,
        public byteCount: number,
        public body: Uint8Array,
    ) { }
}


class Column {
    constructor(
        public name: string,
        public tableOid: number,
        public index: number,
        public typeOid: number,
        public columnLength: number,
        public typeModifier: number,
        public format: Format,
    ) { }
}

export class RowDescription {
    constructor(
        public columnCount: number,
        public columns: Column[],
    ) { }
}


export class Connection {
    private bufReader: BufReader;
    private bufWriter: BufWriter;
    private packetWriter: PacketWriter;
    private decoder: TextDecoder = new TextDecoder();
    private encoder: TextEncoder = new TextEncoder();

    constructor(private reader: Reader, private writer: Writer) {
        this.bufReader = new BufReader(reader);
        this.bufWriter = new BufWriter(writer);
        this.packetWriter = new PacketWriter();
    }

    /** Read single message send by backend */
    async readMessage(): Promise<Message> {
        // TODO: reuse buffer instead of allocating new ones each for each read
        const header = new Uint8Array(5);
        await this.bufReader.readFull(header);
        const msgType = this.decoder.decode(header.slice(0, 1));
        const msgLength = readUInt32BE(header, 1) - 4;
        const msgBody = new Uint8Array(msgLength);
        await this.bufReader.readFull(msgBody);

        return new Message(msgType, msgLength, msgBody);
    }

    // TODO: add types
    async startup(config: ConnectionParams) {
        const writer = this.packetWriter
            .addInt16(3)
            .addInt16(0);

        // TODO: handle rest of config properly
        ["user", "database", "application_name"].forEach(function (key) {
            const val = config[key];
            writer.addCString(key).addCString(val);
        })

        writer.addCString('client_encoding').addCString("'utf-8'");
        const bodyBuffer = writer.addCString('').flush();
        var length = bodyBuffer.length + 4;

        var buffer = new PacketWriter()
            .addInt32(length)
            .add(bodyBuffer)
            .join();

        await this.bufWriter.write(buffer);
        await this.bufWriter.flush();

        let msg: Message;

        msg = await this.readMessage();
        this.handleAuth(msg);

        // TODO: refactor
        let isDone = false;
        while (!isDone) {
            msg = await this.readMessage();
            switch (msg.type) {
                // backend key data
                case "K":
                    this.processBackendKeyData(msg);
                    break;
                // parameter status    
                case "S":
                    this.processParameterStatus(msg);
                    break;
                // ready for query
                case "Z":
                    this.processReadyForQuery(msg);
                    isDone = true;
                    break;
                default:
                    throw new Error(`Unknown response for startup: ${msg.type}`);
            }
        }
    }

    async handleAuth(msg: Message) {
        const code = readUInt32BE(msg.body, 0);
        switch (code) {
            case 0:
                // pass
                break;
            case 3:
                // cleartext password
                // TODO
                break;
            case 5:
                // md5 password
                // TODO
                break;
            default:
                throw new Error(`Unknown auth message code ${code}`);
        }
    }

    processBackendKeyData(msg: Message) {
        const pid = readUInt32BE(msg.body, 0);
        const secretKey = readUInt32BE(msg.body, 4);
        // TODO: save those values on connection
        console.log('process backend key', pid, secretKey);
    }

    processParameterStatus(msg: Message) {
        // TODO: handle Timezone and server version
        // console.log('process parameter status')
    }

    processReadyForQuery(msg: Message) {
        // TODO: make an enum of transaction statuses
        const txStatus = this.decoder.decode(msg.body.slice(0, 1));
        console.log('ready for query, transaction status', txStatus);
    }

    async query(query: string) {
        this.packetWriter.clear();

        const buffer = this.packetWriter
            .addCString(query)
            .flush(0x51);

        await this.bufWriter.write(buffer);
        await this.bufWriter.flush();

        const result = new QueryResult();

        let msg: Message;

        msg = await this.readMessage();

        switch (msg.type) {
            // row description
            case "T":
                result.handleRowDescription(this.handleRowDescription(msg));
                break;
            // no data    
            case "n":
                // TODO: handle this message type properly
                console.log("no data", msg);
                return result;
            default:
                throw new Error(`Unexpected frame: ${msg.type}`);
        }

        // TODO: refactor
        let isDone = false;
        while (!isDone) {
            msg = await this.readMessage();
            switch (msg.type) {
                // data row
                case "D":
                    // this is actually packet read 
                    const foo = this.parseDataRow(msg, Format.TEXT);
                    result.handleDataRow(foo)
                    break;
                // command complete
                case "C":
                    isDone = true;
                    break;

                // TODO: handle other types of messages

                default:
                    throw new Error(`Unexpected frame: ${msg.type}`);
            }
        }

        return result;
    }

    handleRowDescription(msg: Message): RowDescription {
        const packetReader = new PacketReader(msg.body);
        const columnCount = packetReader.readInt16();
        const columns = [];

        for (let i = 0; i < columnCount; i++) {
            // TODO: if one of columns has 'format' == 'binary',
            //  all of them will be in same format?
            const column = new Column(
                packetReader.readCString(), // name
                packetReader.readInt32(),   // tableOid
                packetReader.readInt16(),   // index
                packetReader.readInt32(),   // dataTypeOid
                packetReader.readInt16(),   // column
                packetReader.readInt32(),   // typeModifier
                packetReader.readInt16(),   // format
            )
            columns.push(column);
        }

        return new RowDescription(columnCount, columns);
    }

    parseDataRow(msg: Message, format: Format): any[] {
        const packetReader = new PacketReader(msg.body);
        const fieldCount = packetReader.readInt16();
        const row = [];

        for (let i = 0; i < fieldCount; i++) {
            const colLength = packetReader.readInt32();

            if (colLength == -1) {
                row.push(null);
                continue;
            }

            if (format === Format.TEXT) {
                const foo = packetReader.readString(colLength);
                row.push(foo)
            } else {
                row.push(packetReader.readBytes(colLength))
            }
        }

        return row;
    }

    async end() {
        const terminationMessage = new Uint8Array([0x58, 0x00, 0x00, 0x00, 0x04]);
        await this.bufWriter.write(terminationMessage);
        await this.bufWriter.flush();
    }
}