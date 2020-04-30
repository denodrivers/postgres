# deno-postgres

![ci](https://github.com/buildondata/deno-postgres/workflows/ci/badge.svg)
[![Gitter chat](https://badges.gitter.im/gitterHQ/gitter.png)](https://gitter.im/deno-postgres/community)

PostgreSQL driver for Deno.

It's still work in progress, but you can take it for a test drive!

`deno-postgres` is being developed based on excellent work of [node-postgres](https://github.com/brianc/node-postgres)
and [pq](https://github.com/lib/pq).

## To Do:

- [x] connecting to database
- [x] password handling:
  - [x] cleartext
  - [x] MD5
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

## Docs

Docs are available at [https://deno-postgres.com/](https://deno-postgres.com/)

## Contributing guidelines

When contributing to repository make sure to:

a) open an issue for what you're working on

b) properly format code using `deno fmt`

```shell
$ deno fmt -- --check
```

## License

There are substantial parts of this library based on other libraries. They have preserved their individual licenses and copyrights.

Eveything is licensed under the MIT License.

All additional work is copyright 2018 - 2019 — Bartłomiej Iwańczuk — All rights reserved.
