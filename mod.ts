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
export { PoolClient, QueryClient } from "./client.ts";
export type { QueryObjectOptions, QueryOptions } from "./query/query.ts";
export { Savepoint, Transaction } from "./query/transaction.ts";
export type { TransactionOptions } from "./query/transaction.ts";
