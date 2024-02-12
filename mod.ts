// Check for minimum supported V8 runtime version
if(Deno.version.deno >= 1.38) {
  throw new Error("deno-postgres requires at least Deno v1.38 including V8 v12 or later.")
}

export { Client } from "./client.ts";
export {
  ConnectionError,
  PostgresError,
  TransactionError,
} from "./client/error.ts";
export { Pool } from "./pool.ts";

// TODO
// Remove the following reexports after https://doc.deno.land
// supports two level depth exports
export type {
  ClientOptions,
  ConnectionOptions,
  ConnectionString,
  TLSOptions,
} from "./connection/connection_params.ts";
export type { Session } from "./client.ts";
export type { Notice } from "./connection/message.ts";
export { PoolClient, QueryClient } from "./client.ts";
export type {
  CommandType,
  QueryArguments,
  QueryArrayResult,
  QueryObjectOptions,
  QueryObjectResult,
  QueryOptions,
  QueryResult,
  ResultType,
  RowDescription,
} from "./query/query.ts";
export { Savepoint, Transaction } from "./query/transaction.ts";
export type {
  IsolationLevel,
  TransactionOptions,
} from "./query/transaction.ts";
