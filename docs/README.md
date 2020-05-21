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
    host: "localhost",
    port: "5432"
  });
  await client.connect();
  const result = await client.query("SELECT * FROM people;");
  console.log(result.rows);
  await client.end();
}

main();
```

## API

`deno-postgres` follows `node-postgres` API to make transition for Node devs as easy as possible.

### Connecting to DB

If any of parameters is missing it is read from environmental variable.

```ts
import { Client } from "https://deno.land/x/postgres/mod.ts";

let config;

config = {
  host: "localhost",
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
