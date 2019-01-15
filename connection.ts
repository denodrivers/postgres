import { Conn } from "deno";
import { BufReader, BufWriter } from "https://deno.land/x/io/bufio.ts";
import { PacketWriter } from "./packet_writer.ts";
import { readUInt32BE, readInt32BE, readInt16BE, readUInt16BE } from "./utils.ts";
import { PacketReader } from "./packet_reader.ts";
import { QueryResult, Query, QueryConfig } from "./query.ts";
import { parseError } from "./error.ts";


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

enum TransactionStatus {
    Idle = "I",
    IdleInTransaction = "T",
    InFailedTransaction = "E",
};

export class Message {
    public reader: PacketReader;

    constructor(
        public type: string,
        public byteCount: number,
        public body: Uint8Array,
    ) {
        this.reader = new PacketReader(body);
    }
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

    private _transactionStatus?: TransactionStatus;
    private _pid?: number;
    private _secretKey?: number;
    private _parameters: { [key: string]: string } = {};

    constructor(private conn: Conn) {
        this.bufReader = new BufReader(conn);
        this.bufWriter = new BufWriter(conn);
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

    // TODO: rewrite this function not to use new PacketWriter
    private async _sendStartupMessage(connParams: ConnectionParams) {
        const writer = this.packetWriter;
        
        // protocol version - 3.0, written as 
        writer.addInt16(3).addInt16(0);

        // TODO: recognize other parameters
        ["user", "database", "application_name"].forEach(function (key) {
            const val = connParams[key];
            writer.addCString(key).addCString(val);
        })

        // eplicitly set utf-8 encoding
        writer.addCString('client_encoding').addCString("'utf-8'");
        // terminator after all parameters were writter
        writer.addCString("");

        const bodyBuffer = writer.flush();
        var length = bodyBuffer.length + 4;

        var buffer = new PacketWriter()
            .addInt32(length)
            .add(bodyBuffer)
            .join();

        await this.bufWriter.write(buffer);
    }

    async startup(connParams: ConnectionParams) {
        await this._sendStartupMessage(connParams);
        await this.bufWriter.flush();

        let msg: Message;

        msg = await this.readMessage();
        this.handleAuth(msg);

        while (true) {
            msg = await this.readMessage();
            switch (msg.type) {
                // backend key data
                case "K":
                    this._processBackendKeyData(msg);
                    break;
                // parameter status    
                case "S":
                    this._processParameterStatus(msg);
                    break;
                // ready for query
                case "Z":
                    this._processReadyForQuery(msg);
                    return;
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

    private _processBackendKeyData(msg: Message) {
        this._pid = msg.reader.readInt32();
        this._secretKey = msg.reader.readInt32();
    }

    private _processParameterStatus(msg: Message) {
        // TODO: should we save all parameters?
        const key = msg.reader.readCString();
        const value = msg.reader.readCString();
        this._parameters[key] = value;
    }

    private _processReadyForQuery(msg: Message) {
        const txStatus = msg.reader.readByte();
        this._transactionStatus = String.fromCharCode(txStatus) as TransactionStatus;
    }

    private async _readReadyForQuery() {
        const msg = await this.readMessage();

        if (msg.type !== 'Z') {
            throw new Error(`Unexpected message type: ${msg.type}, expected "Z" (ReadyForQuery)`);
        }

        this._processReadyForQuery(msg);
    }

    private async _simpleQuery(query: Query): Promise<QueryResult> {
        this.packetWriter.clear();

        const buffer = this.packetWriter
            .addCString(query.config.text)
            .flush(0x51);

        await this.bufWriter.write(buffer);
        await this.bufWriter.flush();

        const result = query.result;

        let msg: Message;

        msg = await this.readMessage();

        switch (msg.type) {
            // row description
            case "T":
                result.handleRowDescription(this.handleRowDescription(msg));
                break;
            // no data    
            case "n":
                return result;
            // error response
            case "E":
                await this._processError(msg);
                break;
            default:
                throw new Error(`Unexpected frame: ${msg.type}`);
        }

        while (true) {
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
                    result.done();
                    break;
                // ready for query
                case "Z":
                    this._processReadyForQuery(msg);
                    return result;
                // error response
                case "E":
                    await this._processError(msg);
                    break;
                default:
                    throw new Error(`Unexpected frame: ${msg.type}`);
            }
        }
    }

    async _sendPrepareMessage(config: QueryConfig) {
        this.packetWriter.clear();

        const buffer = this.packetWriter
            .addCString("") // TODO: handle named queries (config.name)
            .addCString(config.text)
            .addInt16(0)
            .flush(0x50);
        await this.bufWriter.write(buffer);
    }

    async _sendBindMessage(config: QueryConfig) {
        this.packetWriter.clear();

        // bind statement
        this.packetWriter.clear();
        this.packetWriter
            .addCString("") // unnamed portal
            .addCString("") // unnamed prepared statement
            .addInt16(0) // TODO: handle binary arguments here
            .addInt16(config.args.length);

        config.args.forEach(arg => {
            if (arg === null || typeof arg === 'undefined') {
                this.packetWriter.addInt32(-1)
            } else if (arg instanceof Uint8Array) {
                this.packetWriter.addInt32(arg.length)
                this.packetWriter.add(arg);
            } else {
                const byteLength = this.encoder.encode(arg).length;
                this.packetWriter.addInt32(byteLength);
                this.packetWriter.addString(arg);
            }
        });

        this.packetWriter.addInt16(0);
        const buffer = this.packetWriter.flush(0x42);
        await this.bufWriter.write(buffer);
    }

    async _sendDescribeMessage() {
        this.packetWriter.clear();

        const buffer = this.packetWriter
            .addCString("P")
            .flush(0x44);
        await this.bufWriter.write(buffer);
    }

    async _sendExecuteMessage() {
        this.packetWriter.clear();

        const buffer = this.packetWriter
            .addCString("") // unnamed portal
            .addInt32(0)
            .flush(0x45);
        await this.bufWriter.write(buffer);
    }

    async _sendFlushMessage() {
        this.packetWriter.clear();

        const buffer = this.packetWriter
            .flush(0x48);
        await this.bufWriter.write(buffer);
    }

    async _sendSyncMessage() {
        this.packetWriter.clear();

        const buffer = this.packetWriter
            .flush(0x53);
        await this.bufWriter.write(buffer);
    }

    async _processError(msg: Message) {
        const error = parseError(msg);
        await this._readReadyForQuery();
        throw error;
    }

    private async _readParseComplete() {
        const msg = await this.readMessage();

        switch (msg.type) {
            // parse completed
            case "1":
                // TODO: add to already parsed queries if
                // query has name, so it's not parsed again
                break;
            // error response
            case "E":
                await this._processError(msg);
                break;
            default: 
                throw new Error(`Unexpected frame: ${msg.type}`);
        }
    }

    private async _readBindComplete() {
        const msg = await this.readMessage();

        switch (msg.type) {
            // bind completed
            case "2":
                // no-op
                break;
            // error response
            case "E":
                await this._processError(msg);
                break;
            default:
                throw new Error(`Unexpected frame: ${msg.type}`);
        }
    }

    // TODO: I believe error handling here is not correct, shouldn't 'sync' message be
    //  sent after error response is received in prepared statements?
    async _preparedQuery(query: Query): Promise<QueryResult> {
        await this._sendPrepareMessage(query.config);
        await this._sendBindMessage(query.config);
        await this._sendDescribeMessage();
        await this._sendExecuteMessage();
        await this._sendSyncMessage();
        // send all messages to backend
        await this.bufWriter.flush();

        await this._readParseComplete();
        await this._readBindComplete();
        
        const result = query.result;
        let msg: Message;
        msg = await this.readMessage();

        switch (msg.type) {
            // row description
            case "T":
                const rowDescription = this._processRowDescription(msg);
                result.handleRowDescription(rowDescription);
                break;
            // no data    
            case "n":
                return result;
            // error
            case "E":
                await this._processError(msg);
                break;
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
                    result.done();
                    // TODO: this is horrible
                    isDone = true;
                    break;
                // error response
                case "E":
                    await this._processError(msg);
                    break;
                default:
                    throw new Error(`Unexpected frame: ${msg.type}`);
            }
        }

        await this._sendSyncMessage();
        await this.bufWriter.flush();

        await this._readReadyForQuery();

        return result;
    }

    async query(query: Query): Promise<QueryResult> {
        if (query.config.args.length === 0) {
            return await this._simpleQuery(query);
        }
        return await this._preparedQuery(query);
    }

    private _processRowDescription(msg: Message): RowDescription {
        const columnCount = msg.reader.readInt16();
        const columns = [];

        for (let i = 0; i < columnCount; i++) {
            // TODO: if one of columns has 'format' == 'binary',
            //  all of them will be in same format?
            const column = new Column(
                msg.reader.readCString(), // name
                msg.reader.readInt32(),   // tableOid
                msg.reader.readInt16(),   // index
                msg.reader.readInt32(),   // dataTypeOid
                msg.reader.readInt16(),   // column
                msg.reader.readInt32(),   // typeModifier
                msg.reader.readInt16(),   // format
            )
            columns.push(column);
        }

        return new RowDescription(columnCount, columns);
    }

    parseDataRow(msg: Message, format: Format): any[] {
        const fieldCount = msg.reader.readInt16();
        const row = [];

        for (let i = 0; i < fieldCount; i++) {
            const colLength = msg.reader.readInt32();

            if (colLength == -1) {
                row.push(null);
                continue;
            }

            if (format === Format.TEXT) {
                const foo = msg.reader.readString(colLength);
                row.push(foo)
            } else {
                row.push(msg.reader.readBytes(colLength))
            }
        }

        return row;
    }

    async end(): Promise<void> {
        const terminationMessage = new Uint8Array([0x58, 0x00, 0x00, 0x00, 0x04]);
        await this.bufWriter.write(terminationMessage);
        await this.bufWriter.flush();
        this.conn.close();
    }
}