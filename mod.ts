export { Client } from "./client.ts";
export { PostgresError } from "./connection/warning.ts";
export { Pool } from "./pool.ts";

// TODO
// Remove the following reexports after https://doc.deno.land
// supports two level depth exports
export { PoolClient, QueryClient } from "./client.ts";
export type { QueryConfig, QueryObjectConfig } from "./query/query.ts";
export { Transaction } from "./query/transaction.ts";
export type { TransactionOptions } from "./query/transaction.ts";
