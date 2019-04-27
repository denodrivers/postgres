# deno-postgres 
[![Build Status](https://travis-ci.com/bartlomieju/deno-postgres.svg?branch=master)](https://travis-ci.com/bartlomieju/deno-postgres)
[![Gitter chat](https://badges.gitter.im/gitterHQ/gitter.png)](https://gitter.im/deno-postgres/community)

PostgreSQL driver for Deno.

It's still work in progress, but you can take it for a test drive!

`deno-postgres` is being developed based on excellent work of [node-postgres](https://github.com/brianc/node-postgres)
and [pq](https://github.com/lib/pq).


## To Do:

- [x] connecting to database
- [ ] password handling: 
  - [x] cleartext
  - [ ] MD5
- [x] DSN style connection parameters
- [x] reading connection parameters from environmental variables
- [x] termination of connection
- [x] simple queries (no arguments)
- [x] parsing Postgres data types to native TS types
- [x] row description
- [x] parametrized queries
- [x] connection pooling
- [x] parsing error response
- [ ] SSL (waiting for Deno to support TLS)
- [ ] tests, tests, tests


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

## License

There are substantial parts of this library based on other libraries. They have preserved their individual licenses and copyrights.

Eveything is licensed under the MIT License.

All additional work is copyright 2018 - 2019 — Bartłomiej Iwańczuk — All rights reserved.
