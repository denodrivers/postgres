// deno-lint-ignore-file camelcase

/*!
 * Substantial parts adapted from https://github.com/brianc/node-postgres
 * which is licensed as follows:
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2010 - 2019 Brian Carlson
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * 'Software'), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { bold, BufReader, BufWriter, yellow } from "../deps.ts";
import { DeferredStack } from "../utils/deferred.ts";
import { hashMd5Password, readUInt32BE } from "../utils/utils.ts";
import { PacketWriter } from "./packet_writer.ts";
import { Message, parseError, parseNotice } from "./warning.ts";
import {
  Query,
  QueryArrayResult,
  QueryObjectResult,
  QueryResult,
  ResultType,
  RowDescription,
} from "../query/query.ts";
import { Column } from "../query/decode.ts";
import type { ConnectionParams } from "./connection_params.ts";
import * as scram from "./scram.ts";

enum TransactionStatus {
  Idle = "I",
  IdleInTransaction = "T",
  InFailedTransaction = "E",
}

/**
 * This asserts the argument bind response is succesful
 */
function assertArgumentsResponse(msg: Message) {
  switch (msg.type) {
    // bind completed
    case "2":
      // no-op
      break;
    // error response
    case "E":
      throw parseError(msg);
    default:
      throw new Error(`Unexpected frame: ${msg.type}`);
  }
}

function assertSuccessfulStartup(msg: Message) {
  switch (msg.type) {
    case "E":
      throw parseError(msg);
  }
}

function assertSuccessfulAuthentication(auth_message: Message) {
  if (auth_message.type === "E") {
    throw parseError(auth_message);
  } else if (auth_message.type !== "R") {
    throw new Error(`Unexpected auth response: ${auth_message.type}.`);
  }

  const responseCode = auth_message.reader.readInt32();
  if (responseCode !== 0) {
    throw new Error(`Unexpected auth response code: ${responseCode}.`);
  }
}

/**
 * This asserts the query parse response is succesful
 */
function assertQueryResponse(msg: Message) {
  switch (msg.type) {
    // parse completed
    case "1":
      // TODO: add to already parsed queries if
      // query has name, so it's not parsed again
      break;
    // error response
    case "E":
      throw parseError(msg);
    default:
      throw new Error(`Unexpected frame: ${msg.type}`);
  }
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

// TODO
// - Refactor properties to not be lazily initialized
//   or to handle their undefined value
// - Expose connection PID as a method
// - Cleanup properties on startup to guarantee safe reconnection
export class Connection {
  #bufReader!: BufReader;
  #bufWriter!: BufWriter;
  #conn!: Deno.Conn;
  connected = false;
  #connection_params: ConnectionParams;
  #packetWriter = new PacketWriter();
  // TODO
  // Find out what parameters are for
  #parameters: { [key: string]: string } = {};
  #pid?: number;
  #queryLock: DeferredStack<undefined> = new DeferredStack(
    1,
    [undefined],
  );
  // TODO
  // Find out what the secret key is for
  // Clean on startup
  #secretKey?: number;
  #tls = false;
  // TODO
  // Find out what the transaction status is used for
  // Clean on startup
  #transactionStatus?: TransactionStatus;

  /** Indicates if the connection is carried over TLS */
  get tls() {
    return this.#tls;
  }

  constructor(connection_params: ConnectionParams) {
    this.#connection_params = connection_params;
  }

  /** Read single message sent by backend */
  async #readMessage(): Promise<Message> {
    // TODO: reuse buffer instead of allocating new ones each for each read
    const header = new Uint8Array(5);
    await this.#bufReader.readFull(header);
    const msgType = decoder.decode(header.slice(0, 1));
    const msgLength = readUInt32BE(header, 1) - 4;
    const msgBody = new Uint8Array(msgLength);
    await this.#bufReader.readFull(msgBody);

    return new Message(msgType, msgLength, msgBody);
  }

  async #serverAcceptsTLS(): Promise<boolean> {
    const writer = this.#packetWriter;
    writer.clear();
    writer
      .addInt32(8)
      .addInt32(80877103)
      .join();

    await this.#bufWriter.write(writer.flush());
    await this.#bufWriter.flush();

    const response = new Uint8Array(1);
    await this.#conn.read(response);

    switch (String.fromCharCode(response[0])) {
      case "S":
        return true;
      case "N":
        return false;
      default:
        throw new Error(
          `Could not check if server accepts SSL connections, server responded with: ${response}`,
        );
    }
  }

  async #sendStartupMessage(): Promise<Message> {
    const writer = this.#packetWriter;
    writer.clear();
    // protocol version - 3.0, written as
    writer.addInt16(3).addInt16(0);
    const connParams = this.#connection_params;
    // TODO: recognize other parameters
    writer.addCString("user").addCString(connParams.user);
    writer.addCString("database").addCString(connParams.database);
    writer.addCString("application_name").addCString(
      connParams.applicationName,
    );

    // eplicitly set utf-8 encoding
    writer.addCString("client_encoding").addCString("'utf-8'");
    // terminator after all parameters were writter
    writer.addCString("");

    const bodyBuffer = writer.flush();
    const bodyLength = bodyBuffer.length + 4;

    writer.clear();

    const finalBuffer = writer
      .addInt32(bodyLength)
      .add(bodyBuffer)
      .join();

    await this.#bufWriter.write(finalBuffer);
    await this.#bufWriter.flush();

    return await this.#readMessage();
  }

  async #createNonTlsConnection(options: Deno.ConnectOptions) {
    this.#conn = await Deno.connect(options);
    this.#bufWriter = new BufWriter(this.#conn);
    this.#bufReader = new BufReader(this.#conn);
  }

  async #createTlsConnection(
    connection: Deno.Conn,
    options: Deno.ConnectOptions,
  ) {
    if ("startTls" in Deno) {
      // @ts-ignore This API should be available on unstable
      this.#conn = await Deno.startTls(connection, options);
      this.#bufWriter = new BufWriter(this.#conn);
      this.#bufReader = new BufReader(this.#conn);
    } else {
      throw new Error(
        "You need to execute Deno with the `--unstable` argument in order to stablish a TLS connection",
      );
    }
  } /**
   * Calling startup on a connection twice will create a new session and overwrite the previous one
   * https://www.postgresql.org/docs/13/protocol-flow.html#id-1.10.5.7.3
   * */

  async startup() {
    const {
      hostname,
      port,
      tls: {
        enforce: enforceTLS,
      },
    } = this.#connection_params;

    // A BufWriter needs to be available in order to check if the server accepts TLS connections
    await this.#createNonTlsConnection({ hostname, port });

    /**
     * https://www.postgresql.org/docs/13/protocol-flow.html#id-1.10.5.7.11
     * */
    if (await this.#serverAcceptsTLS()) {
      try {
        await this.#createTlsConnection(this.#conn, { hostname, port });
        this.#tls = true;
      } catch (e) {
        if (!enforceTLS) {
          console.error(
            bold(yellow("TLS connection failed with message: ")) +
              e.message +
              "\n" +
              bold("Defaulting to non-encrypted connection"),
          );
          await this.#createNonTlsConnection({ hostname, port });
          this.#tls = false;
        } else {
          throw e;
        }
      }
    } else if (enforceTLS) {
      throw new Error(
        "The server isn't accepting TLS connections. Change the client configuration so TLS configuration isn't required to connect",
      );
    }

    try {
      let startup_response;
      try {
        startup_response = await this.#sendStartupMessage();
      } catch (e) {
        if (e instanceof Deno.errors.InvalidData) {
          if (enforceTLS) {
            throw new Error(
              "The certificate used to secure the TLS connection is invalid",
            );
          } else {
            console.error(
              bold(yellow("TLS connection failed with message: ")) +
                e.message +
                "\n" +
                bold("Defaulting to non-encrypted connection"),
            );
            await this.#createNonTlsConnection({ hostname, port });
            this.#tls = false;
            startup_response = await this.#sendStartupMessage();
          }
        } else {
          throw e;
        }
      }
      assertSuccessfulStartup(startup_response);
      await this.#authenticate(startup_response);

      // Handle connection status
      // (connected but not ready)
      let msg;
      connection_status:
      while (true) {
        msg = await this.#readMessage();
        switch (msg.type) {
          // Connection error (wrong database or user)
          case "E":
            await this.#processError(msg, false);
            break;
          // backend key data
          case "K":
            this.#processBackendKeyData(msg);
            break;
          // parameter status
          case "S":
            this.#processParameterStatus(msg);
            break;
          // ready for query
          case "Z": {
            this.#processReadyForQuery(msg);
            break connection_status;
          }
          default:
            throw new Error(`Unknown response for startup: ${msg.type}`);
        }
      }

      this.connected = true;
    } catch (e) {
      this.#conn.close();
      throw e;
    }
  }

  // TODO
  // Why is this handling the startup message response?
  /**
   * Will attempt to #authenticate with the database using the provided
   * password credentials
   */
  async #authenticate(msg: Message) {
    const code = msg.reader.readInt32();
    switch (code) {
      // pass
      case 0:
        break;
      // cleartext password
      case 3:
        await assertSuccessfulAuthentication(
          await this.#authenticateWithClearPassword(),
        );
        break;
      // md5 password
      case 5: {
        const salt = msg.reader.readBytes(4);
        await assertSuccessfulAuthentication(
          await this.#authenticateWithMd5(salt),
        );
        break;
      }
      case 7: {
        throw new Error(
          "Database server expected gss authentication, which is not supported at the moment",
        );
      }
      // scram-sha-256 password
      case 10: {
        await assertSuccessfulAuthentication(
          await this.#authenticateWithScramSha256(),
        );
        break;
      }
      default:
        throw new Error(`Unknown auth message code ${code}`);
    }
  }

  async #authenticateWithClearPassword(): Promise<Message> {
    this.#packetWriter.clear();
    const password = this.#connection_params.password || "";
    const buffer = this.#packetWriter.addCString(password).flush(0x70);

    await this.#bufWriter.write(buffer);
    await this.#bufWriter.flush();

    return this.#readMessage();
  }

  async #authenticateWithMd5(salt: Uint8Array): Promise<Message> {
    this.#packetWriter.clear();

    if (!this.#connection_params.password) {
      throw new Error("Auth Error: attempting MD5 auth with password unset");
    }

    const password = hashMd5Password(
      this.#connection_params.password,
      this.#connection_params.user,
      salt,
    );
    const buffer = this.#packetWriter.addCString(password).flush(0x70);

    await this.#bufWriter.write(buffer);
    await this.#bufWriter.flush();

    return this.#readMessage();
  }

  async #authenticateWithScramSha256(): Promise<Message> {
    if (!this.#connection_params.password) {
      throw new Error(
        "Auth Error: attempting SCRAM-SHA-256 auth with password unset",
      );
    }

    const client = new scram.Client(
      this.#connection_params.user,
      this.#connection_params.password,
    );
    const utf8 = new TextDecoder("utf-8");

    // SASLInitialResponse
    const clientFirstMessage = client.composeChallenge();
    this.#packetWriter.clear();
    this.#packetWriter.addCString("SCRAM-SHA-256");
    this.#packetWriter.addInt32(clientFirstMessage.length);
    this.#packetWriter.addString(clientFirstMessage);
    this.#bufWriter.write(this.#packetWriter.flush(0x70));
    this.#bufWriter.flush();

    // AuthenticationSASLContinue
    const saslContinue = await this.#readMessage();
    switch (saslContinue.type) {
      case "R": {
        if (saslContinue.reader.readInt32() != 11) {
          throw new Error("AuthenticationSASLContinue is expected");
        }
        break;
      }
      case "E": {
        throw parseError(saslContinue);
      }
      default: {
        throw new Error("unexpected message");
      }
    }
    const serverFirstMessage = utf8.decode(saslContinue.reader.readAllBytes());
    client.receiveChallenge(serverFirstMessage);

    this.#packetWriter.clear();
    // SASLResponse
    this.#packetWriter.addString(await client.composeResponse());
    this.#bufWriter.write(this.#packetWriter.flush(0x70));
    this.#bufWriter.flush();

    // AuthenticationSASLFinal
    const saslFinal = await this.#readMessage();
    switch (saslFinal.type) {
      case "R": {
        if (saslFinal.reader.readInt32() !== 12) {
          throw new Error("AuthenticationSASLFinal is expected");
        }
        break;
      }
      case "E": {
        throw parseError(saslFinal);
      }
      default: {
        throw new Error("unexpected message");
      }
    }
    const serverFinalMessage = utf8.decode(saslFinal.reader.readAllBytes());
    client.receiveResponse(serverFinalMessage);

    // AuthenticationOK
    return this.#readMessage();
  }

  #processBackendKeyData(msg: Message) {
    this.#pid = msg.reader.readInt32();
    this.#secretKey = msg.reader.readInt32();
  }

  #processParameterStatus(msg: Message) {
    // TODO: should we save all parameters?
    const key = msg.reader.readCString();
    const value = msg.reader.readCString();
    this.#parameters[key] = value;
  }

  #processReadyForQuery(msg: Message) {
    const txStatus = msg.reader.readByte();
    this.#transactionStatus = String.fromCharCode(
      txStatus,
    ) as TransactionStatus;
  }

  async #readReadyForQuery() {
    const msg = await this.#readMessage();

    if (msg.type !== "Z") {
      throw new Error(
        `Unexpected message type: ${msg.type}, expected "Z" (ReadyForQuery)`,
      );
    }

    this.#processReadyForQuery(msg);
  }

  async #simpleQuery(
    _query: Query<ResultType.ARRAY>,
  ): Promise<QueryArrayResult>;
  async #simpleQuery(
    _query: Query<ResultType.OBJECT>,
  ): Promise<QueryObjectResult>;
  async #simpleQuery(
    query: Query<ResultType>,
  ): Promise<QueryResult> {
    this.#packetWriter.clear();

    const buffer = this.#packetWriter.addCString(query.text).flush(0x51);

    await this.#bufWriter.write(buffer);
    await this.#bufWriter.flush();

    let result;
    if (query.result_type === ResultType.ARRAY) {
      result = new QueryArrayResult(query);
    } else {
      result = new QueryObjectResult(query);
    }

    let msg: Message;

    msg = await this.#readMessage();

    // Query startup message, executed only once
    switch (msg.type) {
      // row description
      case "T":
        result.loadColumnDescriptions(this.#parseRowDescription(msg));
        break;
      // no data
      case "n":
        break;
      // error response
      case "E":
        await this.#processError(msg);
        break;
      // notice response
      case "N":
        result.warnings.push(await this.#processNotice(msg));
        break;
      // command complete
      // TODO: this is duplicated in next loop
      case "C": {
        const commandTag = this.#getCommandTag(msg);
        result.handleCommandComplete(commandTag);
        result.done();
        break;
      }
      default:
        throw new Error(`Unexpected frame: ${msg.type}`);
    }

    // Handle each row returned by the query
    while (true) {
      msg = await this.#readMessage();
      switch (msg.type) {
        // data row
        case "D": {
          // this is actually packet read
          result.insertRow(this.#parseRowData(msg));
          break;
        }
        // command complete
        case "C": {
          const commandTag = this.#getCommandTag(msg);
          result.handleCommandComplete(commandTag);
          result.done();
          break;
        }
        // ready for query
        case "Z":
          this.#processReadyForQuery(msg);
          return result;
        // error response
        case "E":
          await this.#processError(msg);
          break;
        // notice response
        case "N":
          result.warnings.push(await this.#processNotice(msg));
          break;
        case "T":
          result.loadColumnDescriptions(this.#parseRowDescription(msg));
          break;
        default:
          throw new Error(`Unexpected frame: ${msg.type}`);
      }
    }
  }

  async #appendQueryToMessage<T extends ResultType>(query: Query<T>) {
    this.#packetWriter.clear();

    const buffer = this.#packetWriter
      .addCString("") // TODO: handle named queries (config.name)
      .addCString(query.text)
      .addInt16(0)
      .flush(0x50);
    await this.#bufWriter.write(buffer);
  }

  async #appendArgumentsToMessage<T extends ResultType>(
    query: Query<T>,
  ) {
    this.#packetWriter.clear();

    const hasBinaryArgs = query.args.some((arg) => arg instanceof Uint8Array);

    // bind statement
    this.#packetWriter.clear();
    this.#packetWriter
      .addCString("") // TODO: unnamed portal
      .addCString(""); // TODO: unnamed prepared statement

    if (hasBinaryArgs) {
      this.#packetWriter.addInt16(query.args.length);

      query.args.forEach((arg) => {
        this.#packetWriter.addInt16(arg instanceof Uint8Array ? 1 : 0);
      });
    } else {
      this.#packetWriter.addInt16(0);
    }

    this.#packetWriter.addInt16(query.args.length);

    query.args.forEach((arg) => {
      if (arg === null || typeof arg === "undefined") {
        this.#packetWriter.addInt32(-1);
      } else if (arg instanceof Uint8Array) {
        this.#packetWriter.addInt32(arg.length);
        this.#packetWriter.add(arg);
      } else {
        const byteLength = encoder.encode(arg).length;
        this.#packetWriter.addInt32(byteLength);
        this.#packetWriter.addString(arg);
      }
    });

    this.#packetWriter.addInt16(0);
    const buffer = this.#packetWriter.flush(0x42);
    await this.#bufWriter.write(buffer);
  }

  /**
   * This function appends the query type (in this case prepared statement)
   * to the message
   */
  async #appendQueryTypeToMessage() {
    this.#packetWriter.clear();

    const buffer = this.#packetWriter.addCString("P").flush(0x44);
    await this.#bufWriter.write(buffer);
  }

  async #appendExecuteToMessage() {
    this.#packetWriter.clear();

    const buffer = this.#packetWriter
      .addCString("") // unnamed portal
      .addInt32(0)
      .flush(0x45);
    await this.#bufWriter.write(buffer);
  }

  async #appendSyncToMessage() {
    this.#packetWriter.clear();

    const buffer = this.#packetWriter.flush(0x53);
    await this.#bufWriter.write(buffer);
  }

  async #processError(msg: Message, recoverable = true) {
    const error = parseError(msg);
    if (recoverable) {
      await this.#readReadyForQuery();
    }
    throw error;
  }

  #processNotice(msg: Message) {
    const warning = parseNotice(msg);
    console.error(`${bold(yellow(warning.severity))}: ${warning.message}`);
    return warning;
  }

  // TODO: I believe error handling here is not correct, shouldn't 'sync' message be
  //  sent after error response is received in prepared statements?
  /**
   * https://www.postgresql.org/docs/13/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY
   */
  async #preparedQuery<T extends ResultType>(
    query: Query<T>,
  ): Promise<QueryResult> {
    await this.#appendQueryToMessage(query);
    await this.#appendArgumentsToMessage(query);
    await this.#appendQueryTypeToMessage();
    await this.#appendExecuteToMessage();
    await this.#appendSyncToMessage();
    // send all messages to backend
    await this.#bufWriter.flush();

    await assertQueryResponse(await this.#readMessage());
    await assertArgumentsResponse(await this.#readMessage());

    let result;
    if (query.result_type === ResultType.ARRAY) {
      result = new QueryArrayResult(query);
    } else {
      result = new QueryObjectResult(query);
    }
    let msg: Message;
    msg = await this.#readMessage();

    switch (msg.type) {
      // row description
      case "T": {
        const rowDescription = this.#parseRowDescription(msg);
        result.loadColumnDescriptions(rowDescription);
        break;
      }
      // no data
      case "n":
        break;
      // error
      case "E":
        await this.#processError(msg);
        break;
      default:
        throw new Error(`Unexpected frame: ${msg.type}`);
    }

    outerLoop:
    while (true) {
      msg = await this.#readMessage();
      switch (msg.type) {
        // data row
        case "D": {
          // this is actually packet read
          const rawDataRow = this.#parseRowData(msg);
          result.insertRow(rawDataRow);
          break;
        }
        // command complete
        case "C": {
          const commandTag = this.#getCommandTag(msg);
          result.handleCommandComplete(commandTag);
          result.done();
          break outerLoop;
        }
        // error response
        case "E":
          await this.#processError(msg);
          break;
        default:
          throw new Error(`Unexpected frame: ${msg.type}`);
      }
    }

    await this.#readReadyForQuery();

    return result;
  }

  async query(
    query: Query<ResultType.ARRAY>,
  ): Promise<QueryArrayResult>;
  async query(
    query: Query<ResultType.OBJECT>,
  ): Promise<QueryObjectResult>;
  async query(
    query: Query<ResultType>,
  ): Promise<QueryResult> {
    if (!this.connected) {
      throw new Error("The connection hasn't been initialized");
    }

    await this.#queryLock.pop();
    try {
      if (query.args.length === 0) {
        return await this.#simpleQuery(query);
      } else {
        return await this.#preparedQuery(query);
      }
    } finally {
      this.#queryLock.push(undefined);
    }
  }

  #parseRowDescription(msg: Message): RowDescription {
    const columnCount = msg.reader.readInt16();
    const columns = [];

    for (let i = 0; i < columnCount; i++) {
      // TODO: if one of columns has 'format' == 'binary',
      //  all of them will be in same format?
      const column = new Column(
        msg.reader.readCString(), // name
        msg.reader.readInt32(), // tableOid
        msg.reader.readInt16(), // index
        msg.reader.readInt32(), // dataTypeOid
        msg.reader.readInt16(), // column
        msg.reader.readInt32(), // typeModifier
        msg.reader.readInt16(), // format
      );
      columns.push(column);
    }

    return new RowDescription(columnCount, columns);
  }

  //TODO
  //Research corner cases where #parseRowData can return null values
  // deno-lint-ignore no-explicit-any
  #parseRowData(msg: Message): any[] {
    const fieldCount = msg.reader.readInt16();
    const row = [];

    for (let i = 0; i < fieldCount; i++) {
      const colLength = msg.reader.readInt32();

      if (colLength == -1) {
        row.push(null);
        continue;
      }

      // reading raw bytes here, they will be properly parsed later
      row.push(msg.reader.readBytes(colLength));
    }

    return row;
  }

  #getCommandTag(msg: Message) {
    return msg.reader.readString(msg.byteCount);
  }

  async end(): Promise<void> {
    if (this.connected) {
      const terminationMessage = new Uint8Array([0x58, 0x00, 0x00, 0x00, 0x04]);
      await this.#bufWriter.write(terminationMessage);
      await this.#bufWriter.flush();
      this.#conn.close();
      this.connected = false;
    }
  }
}
