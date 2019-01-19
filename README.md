# deno-postgres [![Build Status](https://travis-ci.com/bartlomieju/deno-postgres.svg?branch=master)](https://travis-ci.com/bartlomieju/deno-postgres) [![Gitter chat](https://badges.gitter.im/gitterHQ/gitter.png)](https://gitter.im/deno-postgres/community)
**WORK IN PROGRESS** PostgreSQL driver for Deno

`deno-postgres` is being developed based on excellent work of [node-postgres](https://github.com/brianc/node-postgres) 
and [pq](https://github.com/lib/pq).

Most of functionality is not yet implemented.

## To Do:

- [x] connecting to database
- [ ] password handling
- [ ] DSN style connection parameters
- [ ] reading connection parameters from environmental variables
- [x] termination of connection
- [x] simple queries (no arguments) 
- [ ] parsing Postgres data types to native TS types
- [x] row description
- [x] parametrized queries
- [ ] connection pooling
- [x] parsing error response
- [ ] SSL
- [ ] tests, tests, tests

## Example
```ts
import { Client } from "https://deno.land/x/postgres/mod.ts";

async function main() {
    const client = new Client({ user: "user", database: "test" });
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
Currently only explicit connection parameters are handled, but support for environmental variables will be added soon.

```ts
import { Client } from "https://deno.land/x/postgres/mod.ts";

const connParameters = {
    user: "user", 
    database: "test",
    application_name: "my_custom_app",
};

const client = new Client(connParameters);
await client.connect();
await client.end();
```

### Queries
Simple query
```ts
const result = await client.query('SELECT * FROM people;');
console.log(result.rows);
```

Parametrized query
```ts
const result = await client.query('SELECT * FROM people WHERE age > $1 AND age < $2;', 10, 20);
console.log(result.rows);

// equivalent using QueryConfig interface
const result = await client.query({
    text: 'SELECT * FROM people WHERE age > $1 AND age < $2;', 
    args: [10, 20]
});
console.log(result.rows);
```

## License
There are substantial parts of this library based on other libraries. They have preserved their individual licenses and copyrights. 

Eveything is licensed under the MIT License.

All additional work is copyright 2018 - 2019 — Bartłomiej Iwańczuk — All rights reserved.