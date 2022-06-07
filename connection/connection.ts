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

import {
  bold,
  BufReader,
  BufWriter,
  delay,
  joinPath,
  yellow,
} from "../deps.ts";
import { DeferredStack } from "../utils/deferred.ts";
import { getSocketName, readUInt32BE } from "../utils/utils.ts";
import { PacketWriter } from "./packet.ts";
import {
  Message,
  type Notice,
  parseBackendKeyMessage,
  parseCommandCompleteMessage,
  parseNoticeMessage,
  parseRowDataMessage,
  parseRowDescriptionMessage,
} from "./message.ts";
import {
  type Query,
  QueryArrayResult,
  QueryObjectResult,
  type QueryResult,
  ResultType,
} from "../query/query.ts";
import { type ClientConfiguration } from "./connection_params.ts";
import * as scram from "./scram.ts";
import {
  ConnectionError,
  ConnectionParamsError,
  PostgresError,
} from "../client/error.ts";
import {
  AUTHENTICATION_TYPE,
  ERROR_MESSAGE,
  INCOMING_AUTHENTICATION_MESSAGES,
  INCOMING_QUERY_MESSAGES,
  INCOMING_TLS_MESSAGES,
} from "./message_code.ts";
import { hashMd5Password } from "./auth.ts";

// Work around unstable limitation
type ConnectOptions =
  | { hostname: string; port: number; transport: "tcp" }
  | { path: string; transport: "unix" };

function assertSuccessfulStartup(msg: Message) {
  switch (msg.type) {
    case ERROR_MESSAGE:
      throw new PostgresError(parseNoticeMessage(msg));
  }
}

function assertSuccessfulAuthentication(auth_message: Message) {
  if (auth_message.type === ERROR_MESSAGE) {
    throw new PostgresError(parseNoticeMessage(auth_message));
  }

  if (
    auth_message.type !== INCOMING_AUTHENTICATION_MESSAGES.AUTHENTICATION
  ) {
    throw new Error(`Unexpected auth response: ${auth_message.type}.`);
  }

  const responseCode = auth_message.reader.readInt32();
  if (responseCode !== 0) {
    throw new Error(`Unexpected auth response code: ${responseCode}.`);
  }
}

function logNotice(notice: Notice) {
  console.error(`${bold(yellow(notice.severity))}: ${notice.message}`);
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

// TODO
// - Refactor properties to not be lazily initialized
//   or to handle their undefined value
export class Connection {
  #bufReader!: BufReader;
  #bufWriter!: BufWriter;
  #conn!: Deno.Conn;
  connected = false;
  #connection_params: ClientConfiguration;
  #message_header = new Uint8Array(5);
  #onDisconnection: () => Promise<void>;
  #packetWriter = new PacketWriter();
  #pid?: number;
  #queryLock: DeferredStack<undefined> = new DeferredStack(
    1,
    [undefined],
  );
  // TODO
  // Find out what the secret key is for
  #secretKey?: number;
  #tls?: boolean;
  #transport?: "tcp" | "socket";

  get pid() {
    return this.#pid;
  }

  /** Indicates if the connection is carried over TLS */
  get tls() {
    return this.#tls;
  }

  /** Indicates the connection protocol used */
  get transport() {
    return this.#transport;
  }

  constructor(
    connection_params: ClientConfiguration,
    disconnection_callback: () => Promise<void>,
  ) {
    this.#connection_params = connection_params;
    this.#onDisconnection = disconnection_callback;
  }

  /**
   * Read single message sent by backend
   */
  async #readMessage(): Promise<Message> {
    // Clear buffer before reading the message type
    this.#message_header.fill(0);
    await this.#bufReader.readFull(this.#message_header);
    const type = decoder.decode(this.#message_header.slice(0, 1));
    // TODO
    // Investigate if the ascii terminator is the best way to check for a broken
    // session
    if (type === "\x00") {
      // This error means that the database terminated the session without notifying
      // the library
      // TODO
      // This will be removed once we move to async handling of messages by the frontend
      // However, unnotified disconnection will remain a possibility, that will likely
      // be handled in another place
      throw new ConnectionError("The session was terminated unexpectedly");
    }
    const length = readUInt32BE(this.#message_header, 1) - 4;
    const body = new Uint8Array(length);
    await this.#bufReader.readFull(body);

    return new Message(type, length, body);
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
      case INCOMING_TLS_MESSAGES.ACCEPTS_TLS:
        return true;
      case INCOMING_TLS_MESSAGES.NO_ACCEPTS_TLS:
        return false;
      default:
        throw new Error(
          `Could not check if server accepts SSL connections, server responded with: ${response}`,
        );
    }
  }

  /** https://www.postgresql.org/docs/14/protocol-flow.html#id-1.10.5.7.3 */
  async #sendStartupMessage(): Promise<Message> {
    const writer = this.#packetWriter;
    writer.clear();

    // protocol version - 3.0, written as
    writer.addInt16(3).addInt16(0);
    // explicitly set utf-8 encoding
    writer.addCString("client_encoding").addCString("'utf-8'");

    // TODO: recognize other parameters
    writer.addCString("user").addCString(this.#connection_params.user);
    writer.addCString("database").addCString(this.#connection_params.database);
    writer.addCString("application_name").addCString(
      this.#connection_params.applicationName,
    );

    const connection_options = Object.entries(this.#connection_params.options);
    if (connection_options.length > 0) {
      // The database expects options in the --key=value
      writer.addCString("options").addCString(
        connection_options.map(([key, value]) => `--${key}=${value}`).join(" "),
      );
    }

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

  async #openConnection(options: ConnectOptions) {
    // @ts-ignore This will throw in runtime if the options passed to it are socket related and deno is running
    // on stable
    this.#conn = await Deno.connect(options);
    this.#bufWriter = new BufWriter(this.#conn);
    this.#bufReader = new BufReader(this.#conn);
  }

  async #openSocketConnection(path: string, port: number) {
    if (Deno.build.os === "windows") {
      throw new Error(
        "Socket connection is only available on UNIX systems",
      );
    }
    const socket = await Deno.stat(path);

    if (socket.isFile) {
      await this.#openConnection({ path, transport: "unix" });
    } else {
      const socket_guess = joinPath(path, getSocketName(port));
      try {
        await this.#openConnection({
          path: socket_guess,
          transport: "unix",
        });
      } catch (e) {
        if (e instanceof Deno.errors.NotFound) {
          throw new ConnectionError(
            `Could not open socket in path "${socket_guess}"`,
          );
        }
        throw e;
      }
    }
  }

  async #openTlsConnection(
    connection: Deno.Conn,
    options: { hostname: string; caCerts: string[] },
  ) {
    this.#conn = await Deno.startTls(connection, options);
    this.#bufWriter = new BufWriter(this.#conn);
    this.#bufReader = new BufReader(this.#conn);
  }

  #resetConnectionMetadata() {
    this.connected = false;
    this.#packetWriter = new PacketWriter();
    this.#pid = undefined;
    this.#queryLock = new DeferredStack(
      1,
      [undefined],
    );
    this.#secretKey = undefined;
    this.#tls = undefined;
    this.#transport = undefined;
  }

  #closeConnection() {
    try {
      this.#conn.close();
    } catch (_e) {
      // Swallow if the connection had errored or been closed beforehand
    } finally {
      this.#resetConnectionMetadata();
    }
  }

  async #startup() {
    this.#closeConnection();

    const {
      hostname,
      host_type,
      port,
      tls: {
        enabled: tls_enabled,
        enforce: tls_enforced,
        caCertificates,
      },
    } = this.#connection_params;

    if (host_type === "socket") {
      await this.#openSocketConnection(hostname, port);
      this.#tls = undefined;
      this.#transport = "socket";
    } else {
      // A BufWriter needs to be available in order to check if the server accepts TLS connections
      await this.#openConnection({ hostname, port, transport: "tcp" });
      this.#tls = false;
      this.#transport = "tcp";

      if (tls_enabled) {
        // If TLS is disabled, we don't even try to connect.
        const accepts_tls = await this.#serverAcceptsTLS()
          .catch((e) => {
            // Make sure to close the connection if the TLS validation throws
            this.#closeConnection();
            throw e;
          });

        // https://www.postgresql.org/docs/14/protocol-flow.html#id-1.10.5.7.11
        if (accepts_tls) {
          try {
            await this.#openTlsConnection(this.#conn, {
              hostname,
              caCerts: caCertificates,
            });
            this.#tls = true;
          } catch (e) {
            if (!tls_enforced) {
              console.error(
                bold(yellow("TLS connection failed with message: ")) +
                  e.message +
                  "\n" +
                  bold("Defaulting to non-encrypted connection"),
              );
              await this.#openConnection({ hostname, port, transport: "tcp" });
              this.#tls = false;
            } else {
              throw e;
            }
          }
        } else if (tls_enforced) {
          // Make sure to close the connection before erroring
          this.#closeConnection();
          throw new Error(
            "The server isn't accepting TLS connections. Change the client configuration so TLS configuration isn't required to connect",
          );
        }
      }
    }

    try {
      let startup_response;
      try {
        startup_response = await this.#sendStartupMessage();
      } catch (e) {
        // Make sure to close the connection before erroring or reseting
        this.#closeConnection();
        if (e instanceof Deno.errors.InvalidData && tls_enabled) {
          if (tls_enforced) {
            throw new Error(
              "The certificate used to secure the TLS connection is invalid.",
            );
          } else {
            console.error(
              bold(yellow("TLS connection failed with message: ")) +
                e.message +
                "\n" +
                bold("Defaulting to non-encrypted connection"),
            );
            await this.#openConnection({ hostname, port, transport: "tcp" });
            this.#tls = false;
            this.#transport = "tcp";
            startup_response = await this.#sendStartupMessage();
          }
        } else {
          throw e;
        }
      }
      assertSuccessfulStartup(startup_response);
      await this.#authenticate(startup_response);

      // Handle connection status
      // Process connection initialization messages until connection returns ready
      let message = await this.#readMessage();
      while (message.type !== INCOMING_AUTHENTICATION_MESSAGES.READY) {
        switch (message.type) {
          // Connection error (wrong database or user)
          case ERROR_MESSAGE:
            await this.#processErrorUnsafe(message, false);
            break;
          case INCOMING_AUTHENTICATION_MESSAGES.BACKEND_KEY: {
            const { pid, secret_key } = parseBackendKeyMessage(message);
            this.#pid = pid;
            this.#secretKey = secret_key;
            break;
          }
          case INCOMING_AUTHENTICATION_MESSAGES.PARAMETER_STATUS:
            break;
          default:
            throw new Error(`Unknown response for startup: ${message.type}`);
        }

        message = await this.#readMessage();
      }

      this.connected = true;
    } catch (e) {
      this.#closeConnection();
      throw e;
    }
  }

  /**
   * Calling startup on a connection twice will create a new session and overwrite the previous one
   *
   * @param is_reconnection This indicates whether the startup should behave as if there was
   * a connection previously established, or if it should attempt to create a connection first
   *
   * https://www.postgresql.org/docs/14/protocol-flow.html#id-1.10.5.7.3
   */
  async startup(is_reconnection: boolean) {
    if (is_reconnection && this.#connection_params.connection.attempts === 0) {
      throw new Error(
        "The client has been disconnected from the database. Enable reconnection in the client to attempt reconnection after failure",
      );
    }

    let reconnection_attempts = 0;
    const max_reconnections = this.#connection_params.connection.attempts;

    let error: Error | undefined;
    // If no connection has been established and the reconnection attempts are
    // set to zero, attempt to connect at least once
    if (!is_reconnection && this.#connection_params.connection.attempts === 0) {
      try {
        await this.#startup();
      } catch (e) {
        error = e;
      }
    } else {
      let interval =
        typeof this.#connection_params.connection.interval === "number"
          ? this.#connection_params.connection.interval
          : 0;
      while (reconnection_attempts < max_reconnections) {
        // Don't wait for the interval on the first connection
        if (reconnection_attempts > 0) {
          if (
            typeof this.#connection_params.connection.interval === "function"
          ) {
            interval = this.#connection_params.connection.interval(interval);
          }

          if (interval > 0) {
            await delay(interval);
          }
        }
        try {
          await this.#startup();
          break;
        } catch (e) {
          // TODO
          // Eventually distinguish between connection errors and normal errors
          reconnection_attempts++;
          if (reconnection_attempts === max_reconnections) {
            error = e;
          }
        }
      }
    }

    if (error) {
      await this.end();
      throw error;
    }
  }

  /**
   * Will attempt to authenticate with the database using the provided
   * password credentials
   */
  async #authenticate(authentication_request: Message) {
    const authentication_type = authentication_request.reader.readInt32();

    let authentication_result: Message;
    switch (authentication_type) {
      case AUTHENTICATION_TYPE.NO_AUTHENTICATION:
        authentication_result = authentication_request;
        break;
      case AUTHENTICATION_TYPE.CLEAR_TEXT:
        authentication_result = await this.#authenticateWithClearPassword();
        break;
      case AUTHENTICATION_TYPE.MD5: {
        const salt = authentication_request.reader.readBytes(4);
        authentication_result = await this.#authenticateWithMd5(salt);
        break;
      }
      case AUTHENTICATION_TYPE.SCM:
        throw new Error(
          "Database server expected SCM authentication, which is not supported at the moment",
        );
      case AUTHENTICATION_TYPE.GSS_STARTUP:
        throw new Error(
          "Database server expected GSS authentication, which is not supported at the moment",
        );
      case AUTHENTICATION_TYPE.GSS_CONTINUE:
        throw new Error(
          "Database server expected GSS authentication, which is not supported at the moment",
        );
      case AUTHENTICATION_TYPE.SSPI:
        throw new Error(
          "Database server expected SSPI authentication, which is not supported at the moment",
        );
      case AUTHENTICATION_TYPE.SASL_STARTUP:
        authentication_result = await this.#authenticateWithSasl();
        break;
      default:
        throw new Error(`Unknown auth message code ${authentication_type}`);
    }

    await assertSuccessfulAuthentication(authentication_result);
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
      throw new ConnectionParamsError(
        "Attempting MD5 authentication with unset password",
      );
    }

    const password = await hashMd5Password(
      this.#connection_params.password,
      this.#connection_params.user,
      salt,
    );
    const buffer = this.#packetWriter.addCString(password).flush(0x70);

    await this.#bufWriter.write(buffer);
    await this.#bufWriter.flush();

    return this.#readMessage();
  }

  /**
   * https://www.postgresql.org/docs/14/sasl-authentication.html
   */
  async #authenticateWithSasl(): Promise<Message> {
    if (!this.#connection_params.password) {
      throw new ConnectionParamsError(
        "Attempting SASL auth with unset password",
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

    const maybe_sasl_continue = await this.#readMessage();
    switch (maybe_sasl_continue.type) {
      case INCOMING_AUTHENTICATION_MESSAGES.AUTHENTICATION: {
        const authentication_type = maybe_sasl_continue.reader.readInt32();
        if (authentication_type !== AUTHENTICATION_TYPE.SASL_CONTINUE) {
          throw new Error(
            `Unexpected authentication type in SASL negotiation: ${authentication_type}`,
          );
        }
        break;
      }
      case ERROR_MESSAGE:
        throw new PostgresError(parseNoticeMessage(maybe_sasl_continue));
      default:
        throw new Error(
          `Unexpected message in SASL negotiation: ${maybe_sasl_continue.type}`,
        );
    }
    const sasl_continue = utf8.decode(
      maybe_sasl_continue.reader.readAllBytes(),
    );
    await client.receiveChallenge(sasl_continue);

    this.#packetWriter.clear();
    this.#packetWriter.addString(await client.composeResponse());
    this.#bufWriter.write(this.#packetWriter.flush(0x70));
    this.#bufWriter.flush();

    const maybe_sasl_final = await this.#readMessage();
    switch (maybe_sasl_final.type) {
      case INCOMING_AUTHENTICATION_MESSAGES.AUTHENTICATION: {
        const authentication_type = maybe_sasl_final.reader.readInt32();
        if (authentication_type !== AUTHENTICATION_TYPE.SASL_FINAL) {
          throw new Error(
            `Unexpected authentication type in SASL finalization: ${authentication_type}`,
          );
        }
        break;
      }
      case ERROR_MESSAGE:
        throw new PostgresError(parseNoticeMessage(maybe_sasl_final));
      default:
        throw new Error(
          `Unexpected message in SASL finalization: ${maybe_sasl_continue.type}`,
        );
    }
    const sasl_final = utf8.decode(
      maybe_sasl_final.reader.readAllBytes(),
    );
    await client.receiveResponse(sasl_final);

    // Return authentication result
    return this.#readMessage();
  }

  async #simpleQuery(
    query: Query<ResultType.ARRAY>,
  ): Promise<QueryArrayResult>;
  async #simpleQuery(
    query: Query<ResultType.OBJECT>,
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

    let error: Error | undefined;
    let current_message = await this.#readMessage();

    // Process messages until ready signal is sent
    // Delay error handling until after the ready signal is sent
    while (current_message.type !== INCOMING_QUERY_MESSAGES.READY) {
      switch (current_message.type) {
        case ERROR_MESSAGE:
          error = new PostgresError(parseNoticeMessage(current_message));
          break;
        case INCOMING_QUERY_MESSAGES.COMMAND_COMPLETE: {
          result.handleCommandComplete(
            parseCommandCompleteMessage(current_message),
          );
          break;
        }
        case INCOMING_QUERY_MESSAGES.DATA_ROW: {
          const row_data = parseRowDataMessage(current_message);
          try {
            result.insertRow(row_data);
          } catch (e) {
            error = e;
          }
          break;
        }
        case INCOMING_QUERY_MESSAGES.EMPTY_QUERY:
          break;
        case INCOMING_QUERY_MESSAGES.NOTICE_WARNING: {
          const notice = parseNoticeMessage(current_message);
          logNotice(notice);
          result.warnings.push(notice);
          break;
        }
        case INCOMING_QUERY_MESSAGES.PARAMETER_STATUS:
          break;
        case INCOMING_QUERY_MESSAGES.READY:
          break;
        case INCOMING_QUERY_MESSAGES.ROW_DESCRIPTION: {
          result.loadColumnDescriptions(
            parseRowDescriptionMessage(current_message),
          );
          break;
        }
        default:
          throw new Error(
            `Unexpected simple query message: ${current_message.type}`,
          );
      }

      current_message = await this.#readMessage();
    }

    if (error) throw error;

    return result;
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
  async #appendDescribeToMessage() {
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

  // TODO
  // Rename process function to a more meaningful name and move out of class
  async #processErrorUnsafe(
    msg: Message,
    recoverable = true,
  ) {
    const error = new PostgresError(parseNoticeMessage(msg));
    if (recoverable) {
      let maybe_ready_message = await this.#readMessage();
      while (maybe_ready_message.type !== INCOMING_QUERY_MESSAGES.READY) {
        maybe_ready_message = await this.#readMessage();
      }
    }
    throw error;
  }

  /**
   * https://www.postgresql.org/docs/14/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY
   */
  async #preparedQuery<T extends ResultType>(
    query: Query<T>,
  ): Promise<QueryResult> {
    // The parse messages declares the statement, query arguments and the cursor used in the transaction
    // The database will respond with a parse response
    await this.#appendQueryToMessage(query);
    await this.#appendArgumentsToMessage(query);
    // The describe message will specify the query type and the cursor in which the current query will be running
    // The database will respond with a bind response
    await this.#appendDescribeToMessage();
    // The execute response contains the portal in which the query will be run and how many rows should it return
    await this.#appendExecuteToMessage();
    await this.#appendSyncToMessage();
    // send all messages to backend
    await this.#bufWriter.flush();

    let result;
    if (query.result_type === ResultType.ARRAY) {
      result = new QueryArrayResult(query);
    } else {
      result = new QueryObjectResult(query);
    }

    let error: Error | undefined;
    let current_message = await this.#readMessage();

    while (current_message.type !== INCOMING_QUERY_MESSAGES.READY) {
      switch (current_message.type) {
        case ERROR_MESSAGE: {
          error = new PostgresError(parseNoticeMessage(current_message));
          break;
        }
        case INCOMING_QUERY_MESSAGES.BIND_COMPLETE:
          break;
        case INCOMING_QUERY_MESSAGES.COMMAND_COMPLETE: {
          result.handleCommandComplete(
            parseCommandCompleteMessage(current_message),
          );
          break;
        }
        case INCOMING_QUERY_MESSAGES.DATA_ROW: {
          const row_data = parseRowDataMessage(current_message);
          try {
            result.insertRow(row_data);
          } catch (e) {
            error = e;
          }
          break;
        }
        case INCOMING_QUERY_MESSAGES.NO_DATA:
          break;
        case INCOMING_QUERY_MESSAGES.NOTICE_WARNING: {
          const notice = parseNoticeMessage(current_message);
          logNotice(notice);
          result.warnings.push(notice);
          break;
        }
        case INCOMING_QUERY_MESSAGES.PARAMETER_STATUS:
          break;
        case INCOMING_QUERY_MESSAGES.PARSE_COMPLETE:
          // TODO: add to already parsed queries if
          // query has name, so it's not parsed again
          break;
        case INCOMING_QUERY_MESSAGES.ROW_DESCRIPTION: {
          result.loadColumnDescriptions(
            parseRowDescriptionMessage(current_message),
          );
          break;
        }
        default:
          throw new Error(
            `Unexpected prepared query message: ${current_message.type}`,
          );
      }

      current_message = await this.#readMessage();
    }

    if (error) throw error;

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
      await this.startup(true);
    }

    await this.#queryLock.pop();
    try {
      if (query.args.length === 0) {
        return await this.#simpleQuery(query);
      } else {
        return await this.#preparedQuery(query);
      }
    } catch (e) {
      if (e instanceof ConnectionError) {
        await this.end();
      }
      throw e;
    } finally {
      this.#queryLock.push(undefined);
    }
  }

  async end(): Promise<void> {
    if (this.connected) {
      const terminationMessage = new Uint8Array([0x58, 0x00, 0x00, 0x00, 0x04]);
      await this.#bufWriter.write(terminationMessage);
      try {
        await this.#bufWriter.flush();
      } catch (_e) {
        // This steps can fail if the underlying connection was closed ungracefully
      } finally {
        this.#closeConnection();
        this.#onDisconnection();
      }
    }
  }
}
