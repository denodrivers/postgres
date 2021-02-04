# deno-postgres

![Build Status](https://img.shields.io/github/workflow/status/denodrivers/postgres/ci?label=Build&logo=github&style=flat-square)
[![Discord server](https://img.shields.io/discord/768918486575480863?color=blue&label=Ask%20for%20help%20here&logo=discord&style=flat-square)](https://discord.gg/HEdTCvZUSf)
![Manual](https://img.shields.io/github/v/release/denodrivers/postgres?color=orange&label=Manual&logo=deno&style=flat-square)
[![Documentation](https://img.shields.io/github/v/release/denodrivers/postgres?color=yellow&label=Documentation&logo=deno&style=flat-square)](https://doc.deno.land/https/deno.land/x/postgres@v0.7.1/mod.ts)
![License](https://img.shields.io/github/license/denodrivers/postgres?color=yellowgreen&label=License&style=flat-square)

```ts
import { Client } from "https://deno.land/x/postgres/mod.ts";

const client = new Client({
  user: "user",
  database: "test",
  hostname: "localhost",
  port: 5432,
});
await client.connect();

const array_result = await client.queryArray("SELECT ID, NAME FROM PEOPLE");
console.log(array_result.rows); // [[1, 'Carlos'], [2, 'John'], ...]

const object_result = await client.queryObject("SELECT ID, NAME FROM PEOPLE");
console.log(object_result.rows); // [{id: 1, name: 'Carlos'}, {id: 2, name: 'John'}, ...]

await client.end();
```

## Connection Management

You are free to create your 'clients' like so:

```typescript
const client = new Client({
  ...
})
await client.connect()
```

## Pools

For stronger management and scalability, you can use **pools**:

```typescript
import { Pool } from "https://deno.land/x/postgres/mod.ts";
import { PoolClient } from "https://deno.land/x/postgres/client.ts";

const POOL_CONNECTIONS = 20;
const dbPool = new Pool({
  user: "user",
  password: "password",
  database: "database",
  hostname: "hostname",
  port: 5432,
}, POOL_CONNECTIONS);

async function runQuery(query: string) {
  const client: PoolClient = await dbPool.connect();
  const dbResult = await client.queryObject(query);
  client.release();
  return dbResult;
}

await runQuery("SELECT ID, NAME FROM users;"); // [{id: 1, name: 'Carlos'}, {id: 2, name: 'John'}, ...]
await runQuery("SELECT ID, NAME FROM users WHERE id = '1';"); // [{id: 1, name: 'Carlos'}, {id: 2, name: 'John'}, ...]
```

This improves performance, as creating a whole new connection for each query can
be an expensive operation. With pools, you can keep the connections open to be
re-used when requested (`const client = dbPool.connect()`). So one of the active
connections will be used instead of creating a new one.

The number of pools is up to you, but I feel a pool of 20 is good for small
applications. Though remember this can differ based on how active your
application is. Increase or decrease where necessary.

## Connecting to DB

```ts
import { Client } from "https://deno.land/x/postgres/mod.ts";

let config;

config = {
  applicationName: "my_custom_app",
  database: "test",
  hostname: "localhost",
  password: "password",
  port: 5432,
  user: "user",
};

// Alternatively you can use a connection string
config =
  "postgres://user:password@localhost:5432/test?application_name=my_custom_app";

const client = new Client(config);
await client.connect();
await client.end();
```

The values required to connect to the database can be read directly from
environmental variables, given the case that the user doesn't provide them while
initializing the client. The only requirement for this variables to be read is
for Deno to be run with `--allow-env` permissions

The env variables that the client will recognize are the same as `libpq` and
their documentation is available here
https://www.postgresql.org/docs/current/libpq-envars.html

```ts
// PGUSER=user PGPASSWORD=admin PGDATABASE=test deno run --allow-net --allow-env database.js
import { Client } from "https://deno.land/x/postgres/mod.ts";

const client = new Client();
await client.connect();
await client.end();
```

## Queries

Simple query

```ts
const result = await client.queryArray("SELECT ID, NAME FROM PEOPLE");
console.log(result.rows);
```

Parametrized query

```ts
const result = await client.queryArray(
  "SELECT ID, NAME FROM PEOPLE WHERE AGE > $1 AND AGE < $2",
  10,
  20,
);
console.log(result.rows);

// equivalent using QueryConfig interface
const result = await client.queryArray({
  text: "SELECT ID, NAME FROM PEOPLE WHERE AGE > $1 AND AGE < $2",
  args: [10, 20],
});
console.log(result.rows);
```

## Generic Parameters

Both the `queryArray` and `queryObject` functions have a generic implementation
that allows users to type the result of the query

```typescript
const array_result = await client.queryArray<[number, string]>(
  "SELECT ID, NAME FROM PEOPLE WHERE ID = 17",
);
// [number, string]
const person = array_result.rows[0];

const object_result = await client.queryObject<{ id: number; name: string }>(
  "SELECT ID, NAME FROM PEOPLE WHERE ID = 17",
);
// {id: number, name: string}
const person = object_result.rows[0];
```

## Object query

The `queryObject` function allows you to return the results of the executed
query as a set objects, allowing easy management with interface like types.

```ts
interface User {
  id: number;
  name: string;
}

const result = await client.queryObject<User>(
  "SELECT ID, NAME FROM PEOPLE",
);

// User[]
const users = result.rows;
```

However, the actual values of the query are determined by the aliases given to
those columns inside the query, so executing something like the following will
result in a totally different result to the one the user might expect

```ts
const result = await client.queryObject(
  "SELECT ID, SUBSTR(NAME, 0, 2) FROM PEOPLE",
);

const users = result.rows; // [{id: 1, substr: 'Ca'}, {id: 2, substr: 'Jo'}, ...]
```

To deal with this issue, it's recommended to provide a field list that maps to
the expected properties we want in the resulting object

```ts
const result = await client.queryObject(
  {
    text: "SELECT ID, SUBSTR(NAME, 0, 2) FROM PEOPLE",
    fields: ["id", "name"],
  },
);

const users = result.rows; // [{id: 1, name: 'Ca'}, {id: 2, name: 'Jo'}, ...]
```

Don't use TypeScript generics to map these properties, since TypeScript is for
documentation purposes only it won't affect the final outcome of the query

```ts
interface User {
  id: number;
  name: string;
}

const result = await client.queryObject<User>(
  "SELECT ID, SUBSTR(NAME, 0, 2) FROM PEOPLE",
);

// Type will be User[], but actual outcome will always be
const users = result.rows; // [{id: 1, substr: 'Ca'}, {id: 2, substr: 'Jo'}, ...]
```

- The fields will be matched in the order they were defined
- The fields will override any defined alias in the query
- These field properties must be unique (case insensitive), otherwise the query
  will throw before execution
- The fields must match the number of fields returned on the query, otherwise
  the query will throw on execution

```ts
// This will throw because the property id is duplicated
await client.queryObject(
  {
    text: "SELECT ID, SUBSTR(NAME, 0, 2) FROM PEOPLE",
    fields: ["id", "ID"],
  },
);

// This will throw because the returned number of columns don't match the
// number of defined ones in the function call
await client.queryObject(
  {
    text: "SELECT ID, SUBSTR(NAME, 0, 2) FROM PEOPLE",
    fields: ["id", "name", "something_else"],
  },
);
```
