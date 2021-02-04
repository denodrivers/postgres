# deno-postgres

![Build Status](https://img.shields.io/github/workflow/status/denodrivers/postgres/ci?label=Build&logo=github&style=flat-square)
[![Discord server](https://img.shields.io/discord/768918486575480863?color=blue&label=Ask%20for%20help%20here&logo=discord&style=flat-square)](https://discord.gg/HEdTCvZUSf)
[![Manual](https://img.shields.io/github/v/release/denodrivers/postgres?color=orange&label=Manual&logo=deno&style=flat-square)](https://deno-postgres.com)
[![Documentation](https://img.shields.io/github/v/release/denodrivers/postgres?color=yellow&label=Documentation&logo=deno&style=flat-square)](https://doc.deno.land/https/deno.land/x/postgres@v0.7.1/mod.ts)
[![License](https://img.shields.io/github/license/denodrivers/postgres?color=yellowgreen&label=License&style=flat-square)](LICENSE)

PostgreSQL driver for Deno.

It's still work in progress, but you can take it for a test drive!

`deno-postgres` is being developed based on excellent work of
[node-postgres](https://github.com/brianc/node-postgres) and
[pq](https://github.com/lib/pq).

## Example

```ts
import { Client } from "https://deno.land/x/postgres/mod.ts";

const client = new Client({
  user: "user",
  database: "test",
  hostname: "localhost",
  port: 5432,
});
await client.connect();

{
  const result = await client.queryArray("SELECT ID, NAME FROM PEOPLE");
  console.log(result.rows); // [[1, 'Carlos'], [2, 'John'], ...]
}

{
  const result = await client.queryObject("SELECT ID, NAME FROM PEOPLE");
  console.log(result.rows); // [{id: 1, name: 'Carlos'}, {id: 2, name: 'Johnru'}, ...]
}

await client.end();
```

## Docs

Docs are available at [https://deno-postgres.com/](https://deno-postgres.com/)

## Contributing guidelines

When contributing to repository make sure to:

1. All features and fixes must have an open issue in order to be discussed
2. All public interfaces must be typed and have a corresponding JS block
   explaining their usage
3. All code must pass the format and lint checks enforced by `deno fmt` and
   `deno lint` respectively

## License

There are substantial parts of this library based on other libraries. They have
preserved their individual licenses and copyrights.

Eveything is licensed under the MIT License.

All additional work is copyright 2018 - 2021 — Bartłomiej Iwańczuk and Steven
Guerrero — All rights reserved.
