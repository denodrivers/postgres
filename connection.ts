import { dial, Reader, Writer } from "deno";
import { BufReader, BufWriter } from "https://deno.land/x/net/bufio.ts";
import { FooWriter } from "./buffer.ts";
import { BufferedReader, readUInt32BE, readInt32BE, readInt16BE, readUInt16BE } from "./buffered_reader.ts";

export interface ConnectionParams {
    database?: string;
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    application_name?: string;
}

const decoder = new TextDecoder();

class Message {
    constructor(
        public type: string,
        public length: number,
        public body: Uint8Array,
    ) {}
}

export class Connection {
    private bufReader: BufReader;
    private bufWriter: BufWriter;
    private _fooWriter: FooWriter;
    private fooreader: Reader;
    private _reader: BufferedReader;

    constructor(private reader: Reader, private writer: Writer) {
        this.bufReader = new BufReader(reader);
        this.fooreader = reader;
        this.bufWriter = new BufWriter(writer);
        this._fooWriter = new FooWriter();
        this._reader = new BufferedReader({
            stream: reader,
            headerSize: 1,
            lengthPadding: -4
        });
    }

    
    // TODO: add types
    async startup(config: ConnectionParams) {
        const writer = this._fooWriter
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

        var buffer = new FooWriter()
            .addInt32(length)
            .add(bodyBuffer)
            .join();

        await this.bufWriter.write(buffer);
        await this.bufWriter.flush();
        
        this.handleAuth(await this.receiveMessage());

        // TODO: refactor
        let isDone = false;
        while (!isDone) {
            const msg = await this.receiveMessage();
            switch (msg.type) {
                case 'K':
                    this.processBackendKeyData(msg);
                    break;
                case 'S':
                    this.processParameterStatus(msg);
                    break;
                case 'Z':
                    this.processReadyForQuery(msg);
                    isDone = true;
                    break;
                default:
                    throw new Error(`unknown response for startup: ${msg.type}`);
            }
        }
    }

    async receiveMessage(): Promise<Message> {
        const header = new Uint8Array(5);
        await this.bufReader.readFull(header);
        const msgType = decoder.decode(header.slice(0, 1));
        const msgLength = readUInt32BE(header, 1) - 4;
        const msgBody = new Uint8Array(msgLength);
        await this.bufReader.readFull(msgBody);

        return new Message(msgType, msgLength, msgBody);
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
        console.log('process backend key', pid, secretKey);
    }

    processParameterStatus(msg: Message) {
        // TODO: handle Timezone and server version
        // console.log('process parameter status')
    }

    processReadyForQuery(msg: Message) {
        // TODO: make an enum of transaction statuses 
        const txStatus = decoder.decode(msg.body.slice(0, 1));
        console.log('ready for query, transaction status', txStatus);
    }

    // TODO: make it iterator?
    async query(query: string) {
        this._fooWriter.clear();

        const txt = new TextEncoder().encode(query);
        const length = 1 + 4 + txt.byteLength;

        const buffer = this._fooWriter
            .addCString(query)
            .flush(0x51);

        await this.bufWriter.write(buffer);
        await this.bufWriter.flush();

        let msg = await this.receiveMessage();    
        if (msg.type == "T") {
            // TODO: handle this message and create RowDescription
            //  class

            // console.log('RowDescription', msg);
        } else if (msg.type == "n") {
            // TODO: handle this message type properly
            console.log("no data", msg);
            return [];
        } else {
            throw new Error(`Unexpected frame: ${msg.type}`);
        }

        // TODO: refactor
        const results = [];
        let isDone = false;
        while (!isDone) {
            msg = await this.receiveMessage();
            switch(msg.type) {
                case "D":
                    const dataRow = this.parseDataRow(msg);
                    results.push(dataRow);
                    break;
                // TODO: handle other types of messages
                default:
                    isDone = true;
                    break;    
            }
        }

        return results;
    }

    parseDataRow(msg: Message) {
        // TODO: refactor this method, it should be implemented in PacketReader
        const fieldCount = readInt16BE(msg.body, 0);
        let index = 2;
        const row = [];

        for (let i = 0; i < fieldCount; i++) {
            const colLength = readInt32BE(msg.body, index);
            index += 4;
            if (colLength == -1) {
                row.push(null);
            } else {
                // TODO: avoid additional allocation here
                const data = msg.body.slice(index, index + colLength);
                // TODO: we're not handling binary data here properly
                row.push(decoder.decode(data));
                index += colLength;
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