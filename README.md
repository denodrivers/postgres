# deno-postgres

![Build Status](https://img.shields.io/github/workflow/status/denodrivers/postgres/ci?label=Build&logo=github&style=flat-square)
[![Discord server](https://img.shields.io/discord/768918486575480863?color=blue&label=Ask%20for%20help%20here&logo=discord&style=flat-square)](https://discord.gg/HEdTCvZUSf)
[![Manual](https://img.shields.io/github/v/release/denodrivers/postgres?color=orange&label=Manual&logo=deno&style=flat-square)](https://deno-postgres.com)
[![Documentation](https://img.shields.io/github/v/release/denodrivers/postgres?color=yellow&label=Documentation&logo=deno&style=flat-square)](https://doc.deno.land/https/deno.land/x/postgres@v0.8.0/mod.ts)
[![License](https://img.shields.io/github/license/denodrivers/postgres?color=yellowgreen&label=License&style=flat-square)](LICENSE)

A lightweight PostgreSQL driver for Deno focused on user expirience

`deno-postgres` is being developed based on excellent work of
[node-postgres](https://github.com/brianc/node-postgres) and
[pq](https://github.com/lib/pq).

## Example

```ts
// deno run --allow-net --allow-read --unstable mod.ts
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
  const result = await client.queryArray
    `SELECT ID, NAME FROM PEOPLE WHERE ID = ${1}`;
  console.log(result.rows); // [[1, 'Carlos']]
}

{
  const result = await client.queryObject("SELECT ID, NAME FROM PEOPLE");
  console.log(result.rows); // [{id: 1, name: 'Carlos'}, {id: 2, name: 'Johnru'}, ...]
}

{
  const result = await client.queryObject
    `SELECT ID, NAME FROM PEOPLE WHERE ID = ${1}`;
  console.log(result.rows); // [{id: 1, name: 'Carlos'}]
}

await client.end();
```

For more examples visit the documentation available at
[https://deno-postgres.com/](https://deno-postgres.com/)

## Why do I need unstable to connect using TLS?

Sadly, stablishing a TLS connection in the way Postgres requires it isn't
possible without the `Deno.startTls` API, which is currently marked as unstable.
This is a situation that will be solved once this API is stabilized, however I
don't have an estimated time of when that might happen.

## Documentation

The documentation is available on the deno-postgres website
[https://deno-postgres.com/](https://deno-postgres.com/)

Join me on [Discord](https://discord.gg/HEdTCvZUSf) as well! It's a good place
to discuss bugs and features before opening issues

## Contributing

### Prerequisites

- You must have `docker` and `docker-compose` installed in your machine
  - https://docs.docker.com/get-docker/
  - https://docs.docker.com/compose/install/

- You don't need `deno` installed in your machine to run the tests, since it
  will be installed in the Docker container when you build it. However you will
  need it in order to run the linter and formatter locally
  - https://deno.land/
  - `deno upgrade --version 1.7.1`
  - `dvm install 1.7.1 && dvm use 1.7.1`

- You don't need to install Postgres locally in your machine in order to test
  the library

### Running the tests

The tests are found under the `./tests` folder, and will be run in the Docker
container found in the root of the project.

In order to run the tests run the following commands

1. `docker-compose build tests`
2. `docker-compose run tests`

The build step will check linting and formatting as well and report it to the
command line

## Contributing guidelines

When contributing to repository make sure to:

1. All features and fixes must have an open issue in order to be discussed
2. All public interfaces must be typed and have a corresponding JS block
   explaining their usage
3. All code must pass the format and lint checks enforced by `deno fmt` and
   `deno lint --unstable` respectively. The build will not pass the tests if
   this conditions are not met. Ignore rules will be accepted in the code base
   when their respective justification is given in a comment
4. All features and fixes must have a corresponding test added in order to be
   accepted

## License

There are substantial parts of this library based on other libraries. They have
preserved their individual licenses and copyrights.

Eveything is licensed under the MIT License.

All additional work is copyright 2018 - 2021 — Bartłomiej Iwańczuk and Steven
Guerrero — All rights reserved.
