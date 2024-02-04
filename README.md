# deno-postgres

![Build Status](https://img.shields.io/github/workflow/status/denodrivers/postgres/ci?label=Build&logo=github&style=flat-square)
[![Discord server](https://img.shields.io/discord/768918486575480863?color=blue&label=Ask%20for%20help%20here&logo=discord&style=flat-square)](https://discord.gg/HEdTCvZUSf)
[![Manual](https://img.shields.io/github/v/release/denodrivers/postgres?color=orange&label=Manual&logo=deno&style=flat-square)](https://deno-postgres.com)
[![Documentation](https://img.shields.io/github/v/release/denodrivers/postgres?color=yellow&label=Documentation&logo=deno&style=flat-square)](https://doc.deno.land/https/deno.land/x/postgres@v0.17.1/mod.ts)
[![License](https://img.shields.io/github/license/denodrivers/postgres?color=yellowgreen&label=License&style=flat-square)](LICENSE)

A lightweight PostgreSQL driver for Deno focused on user experience

`deno-postgres` is being developed based on excellent work of
[node-postgres](https://github.com/brianc/node-postgres) and
[pq](https://github.com/lib/pq).

## Example

```ts
// deno run --allow-net --allow-read mod.ts
import { Client } from "https://deno.land/x/postgres@v0.17.1/mod.ts";

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
  const result = await client
    .queryArray`SELECT ID, NAME FROM PEOPLE WHERE ID = ${1}`;
  console.log(result.rows); // [[1, 'Carlos']]
}

{
  const result = await client.queryObject("SELECT ID, NAME FROM PEOPLE");
  console.log(result.rows); // [{id: 1, name: 'Carlos'}, {id: 2, name: 'Johnru'}, ...]
}

{
  const result = await client
    .queryObject`SELECT ID, NAME FROM PEOPLE WHERE ID = ${1}`;
  console.log(result.rows); // [{id: 1, name: 'Carlos'}]
}

await client.end();
```

For more examples visit the documentation available at
[https://deno-postgres.com/](https://deno-postgres.com/)

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
  the library, it will run as a service in the Docker container when you build
  it

### Running the tests

The tests are found under the `./tests` folder, and they are based on query
result assertions

In order to run the tests run the following commands

1. `docker-compose build tests`
2. `docker-compose run tests`

The build step will check linting and formatting as well and report it to the
command line

It is recommended that you don't rely on any previously initialized data for
your tests, instead of that create all the data you need at the moment of
running the tests

For example, the following test will create a temporal table that will disappear
once the test has been completed

```ts
Deno.test("INSERT works correctly", async () => {
  await client.queryArray(
    `CREATE TEMP TABLE MY_TEST (X INTEGER);`,
  );
  await client.queryArray(
    `INSERT INTO MY_TEST (X) VALUES (1);`,
  );
  const result = await client.queryObject<{ x: number }>({
    text: `SELECT X FROM MY_TEST`,
    fields: ["x"],
  });
  assertEquals(result.rows[0].x, 1);
});
```

### Setting up an advanced development environment

More advanced features such as the Deno inspector, test and permission
filtering, database inspection and test code lens can be achieved by setting up
a local testing environment, as shown in the following steps:

1. Start the development databases using the Docker service with the command\
   `docker-compose up postgres_clear postgres_md5 postgres_scram`\
   Though using the detach (`-d`) option is recommended, this will make the
   databases run in the background unless you use docker itself to stop them.
   You can find more info about this
   [here](https://docs.docker.com/compose/reference/up)
2. Set the `DENO_POSTGRES_DEVELOPMENT` environmental variable to true, either by
   prepending it before the test command (on Linux) or setting it globally for
   all environments

   The `DENO_POSTGRES_DEVELOPMENT` variable will tell the testing pipeline to
   use the local testing settings specified in `tests/config.json`, instead of
   the CI settings
3. Run the tests manually by using the command\
   `deno test -A`

## Deno compatibility

Due to breaking changes introduced in the unstable APIs `deno-postgres` uses,
there has been some fragmentation regarding what versions of Deno can be used
alongside the library

This situation will become more stable as `std` and `deno-postgres` approach 1.0

| Deno version  | Min driver version | Max driver version |
| ------------- | ------------------ | ------------------ |
| 1.8.x         | 0.5.0              | 0.10.0             |
| 1.9.0         | 0.11.0             | 0.11.1             |
| 1.9.1 and up  | 0.11.2             | 0.11.3             |
| 1.11.0 and up | 0.12.0             | 0.12.0             |
| 1.14.0 and up | 0.13.0             | 0.13.0             |
| 1.15.0        | 0.13.0             |                    |
| 1.16.0        | 0.14.0             | 0.14.3             |
| 1.17.0        | 0.15.0             |                    |

## Contributing guidelines

When contributing to repository make sure to:

1. All features and fixes must have an open issue in order to be discussed
2. All public interfaces must be typed and have a corresponding JS block
   explaining their usage
3. All code must pass the format and lint checks enforced by `deno fmt` and
   `deno lint` respectively. The build will not pass the tests if these
   conditions are not met. Ignore rules will be accepted in the code base when
   their respective justification is given in a comment
4. All features and fixes must have a corresponding test added in order to be
   accepted

## License

There are substantial parts of this library based on other libraries. They have
preserved their individual licenses and copyrights.

Everything is licensed under the MIT License.

All additional work is copyright 2018 - 2022 — Bartłomiej Iwańczuk and Steven
Guerrero — All rights reserved.
