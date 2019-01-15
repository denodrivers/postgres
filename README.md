# deno-postgres
**WORK IN PROGRESS** PostgreSQL driver for Deno

`deno-postgres` is being developed based on excellent work of [node-postgres](https://github.com/brianc/node-postgres) 
and [pq](https://github.com/lib/pq).

Most of functionality is not yet implemented.

ToDo:

- [x] connecting to database
- [ ] password handling
- [ ] DSN style connection parameters
- [ ] reading connection parameters from environmental variables
- [x] termination of connection
- [x] simple queries (no arguments) 
- [ ] parsing Postgres data types to native TS types
- [x] row description
- [ ] parametrized queries
- [ ] connection pooling
- [x] parsing error response
- [ ] SSL

## Example
```ts
import { Client } from "./main.ts";

async function main() {
    const client = new Client({ user: "user", database: "test" });
    await client.connect();
    const result = await client.query('SELECT $1::text as message', 'Hello world!');
    console.log(result.rows);
    await client.end();
}

main();
```

## API

`deno-postgres` follows `node-postgres` API to make transition for Node devs as easy as possible.
