# deno-postgres

[![Build Status](https://travis-ci.com/bartlomieju/deno-postgres.svg?branch=master)](https://travis-ci.com/bartlomieju/deno-postgres)
[![Gitter chat](https://badges.gitter.im/gitterHQ/gitter.png)](https://gitter.im/deno-postgres/community)

PostgreSQL driver for Deno.

`deno-postgres` is being developed based on excellent work of [node-postgres](https://github.com/brianc/node-postgres)
and [pq](https://github.com/lib/pq).

## Example

```ts
import { Client } from "https://deno.land/x/postgres/mod.ts";

async function main() {
  const client = new Client({
    user: "user",
    database: "test",
    hostname: "localhost",
    port: "5432"
  });
  await client.connect();
  const result = await client.query("SELECT * FROM people;");
  console.log(result.rows);
  await client.end();
}

main();
```

## Connection Management

You are free to create your 'clients' like so:

```typescript
const client = new Client({
  ...
})
await client.connect()
```

But for stronger management and scalability, you can use **pools**:
```typescript
import { Pool } from "https://deno.land/x/postgres@v0.4.0/mod.ts";
import { PoolClient } from "https://deno.land/x/postgres@v0.4.0/client.ts";

const POOL_CONNECTIONS = 50;
const dbPool = new Pool({
  user: "user",
  password: "password",
  database: "database",
  hostname: "hostname",
  port: 5432,
}, POOL_CONNECTIONS);

function runQuery (query: string) {
  const client: PoolClient = await dbPool.connect();
  const dbResult = await client.query(query);
  client.release();
  return dbResult
}

runQuery("SELECT * FROM users;");
runQuery("SELECT * FROM users WHERE id = '1';");
```

This improves performance, as creating a whole new connection for each query can be an expensive operation.
With pools, you can keep the connections open to be re-used when requested (`const client = dbPool.connect()`). So one of the active connections will be used instead  of creating a new one.

The number of pools is up to you, but 50 is generally a good number, but this can differ based on how active your application is.

## API

`deno-postgres` follows `node-postgres` API to make transition for Node devs as easy as possible.

### Connecting to DB

If any of parameters is missing it is read from environmental variable.

```ts
import { Client } from "https://deno.land/x/postgres/mod.ts";

let config;

config = {
  hostname: "localhost",
  port: "5432",
  user: "user",
  database: "test",
  applicationName: "my_custom_app"
};
// alternatively
config = "postgres://user@localhost:5432/test?application_name=my_custom_app";

const client = new Client(config);
await client.connect();
await client.end();
```

### Queries

Simple query

```ts
const result = await client.query("SELECT * FROM people;");
console.log(result.rows);
```

Parametrized query

```ts
const result = await client.query(
  "SELECT * FROM people WHERE age > $1 AND age < $2;",
  10,
  20
);
console.log(result.rows);

// equivalent using QueryConfig interface
const result = await client.query({
  text: "SELECT * FROM people WHERE age > $1 AND age < $2;",
  args: [10, 20]
});
console.log(result.rows);
```

Interface for query result

```typescript
import { QueryResult } from "https://deno.land/x/postgres@v0.4.2/query.ts";

const result: QueryResult = await client.query(...)
if (result.rowCount > 0) {
  console.log("Success")
} else {
  console.log("A new row should have been added but wasnt")
}
```
