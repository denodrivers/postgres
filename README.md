# deno-postgres

![Build Status](https://img.shields.io/github/actions/workflow/status/denodrivers/postgres/ci.yml?branch=main&label=Build&logo=github&style=flat-square)
[![Discord server](https://img.shields.io/discord/768918486575480863?color=blue&label=Ask%20for%20help%20here&logo=discord&style=flat-square)](https://discord.com/invite/HEdTCvZUSf)
[![JSR](https://jsr.io/badges/@db/postgres?style=flat-square)](https://jsr.io/@db/postgres)
[![JSR Score](https://jsr.io/badges/@db/postgres/score?style=flat-square)](https://jsr.io/@db/postgres)
[![Manual](https://img.shields.io/github/v/release/denodrivers/postgres?color=orange&label=Manual&logo=deno&style=flat-square)](https://deno-postgres.com)
[![Documentation](https://img.shields.io/github/v/release/denodrivers/postgres?color=yellow&label=Documentation&logo=deno&style=flat-square)](https://jsr.io/@db/postgres/doc)
[![License](https://img.shields.io/github/license/denodrivers/postgres?color=yellowgreen&label=License&style=flat-square)](LICENSE)

A lightweight PostgreSQL driver for Deno focused on developer experience.

`deno-postgres` is inspired by the excellent work of
[node-postgres](https://github.com/brianc/node-postgres) and
[pq](https://github.com/lib/pq).

## Documentation

The documentation is available on the
[`deno-postgres` website](https://deno-postgres.com/).

Join the [Discord](https://discord.com/invite/HEdTCvZUSf) as well! It's a good
place to discuss bugs and features before opening issues.

## Examples

```ts
// deno run --allow-net --allow-read mod.ts
import { Client } from "jsr:@db/postgres";

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

## Deno compatibility

Due to breaking changes introduced in the unstable APIs `deno-postgres` uses,
there has been some fragmentation regarding what versions of Deno can be used
alongside the driver.

This situation will stabilize as `deno-postgres` approach version 1.0.

| Deno version  | Min driver version | Max version         | Note                                                                           |
| ------------- | ------------------ | ------------------- | ------------------------------------------------------------------------------ |
| 1.8.x         | 0.5.0              | 0.10.0              |                                                                                |
| 1.9.0         | 0.11.0             | 0.11.1              |                                                                                |
| 1.9.1 and up  | 0.11.2             | 0.11.3              |                                                                                |
| 1.11.0 and up | 0.12.0             | 0.12.0              |                                                                                |
| 1.14.0 and up | 0.13.0             | 0.13.0              |                                                                                |
| 1.16.0        | 0.14.0             | 0.14.3              |                                                                                |
| 1.17.0        | 0.15.0             | 0.17.1              |                                                                                |
| 1.40.0        | 0.17.2             | currently supported | 0.17.2 [on JSR](https://jsr.io/@bartlomieju/postgres)                          |
| 2.0.0 and up  | 0.19.4             | currently supported | All versions available as [`@db/postgres` on JSR](https://jsr.io/@db/postgres) |

## Breaking changes

Although `deno-postgres` is reasonably stable and robust, it is a WIP, and we're
still exploring the design. Expect some breaking changes as we reach version 1.0
and enhance the feature set. Please check the Releases for more info on breaking
changes. Please reach out if there are any undocumented breaking changes.

## Found issues?

Please
[file an issue](https://github.com/denodrivers/postgres/issues/new/choose) with
any problems with the driver. If you would like to help, please look at the
issues as well. You can pick up one of them and try to implement it.

## Contributing

### Prerequisites

- You must have `docker` and `docker-compose` installed on your machine

  - https://docs.docker.com/get-docker/
  - https://docs.docker.com/compose/install/

- You don't need `deno` installed in your machine to run the tests since it will
  be installed in the Docker container when you build it. However, you will need
  it to run the linter and formatter locally

  - https://deno.land/
  - `deno upgrade stable`
  - `dvm install stable && dvm use stable`

- You don't need to install Postgres locally on your machine to test the
  library; it will run as a service in the Docker container when you build it

### Running the tests

The tests are found under the `./tests` folder, and they are based on query
result assertions.

To run the tests, run the following commands:

1. `docker compose build tests`
2. `docker compose run tests`

The build step will check linting and formatting as well and report it to the
command line

It is recommended that you don't rely on any previously initialized data for
your tests instead create all the data you need at the moment of running the
tests

For example, the following test will create a temporary table that will
disappear once the test has been completed

```ts
Deno.test("INSERT works correctly", async () => {
  await client.queryArray(`CREATE TEMP TABLE MY_TEST (X INTEGER);`);
  await client.queryArray(`INSERT INTO MY_TEST (X) VALUES (1);`);
  const result = await client.queryObject<{ x: number }>({
    text: `SELECT X FROM MY_TEST`,
    fields: ["x"],
  });
  assertEquals(result.rows[0].x, 1);
});
```

### Setting up an advanced development environment

More advanced features, such as the Deno inspector, test, and permission
filtering, database inspection, and test code lens can be achieved by setting up
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
   use the local testing settings specified in `tests/config.json` instead of
   the CI settings.

3. Run the tests manually by using the command\
   `deno test -A`

## Contributing guidelines

When contributing to the repository, make sure to:

1. All features and fixes must have an open issue to be discussed
2. All public interfaces must be typed and have a corresponding JSDoc block
   explaining their usage
3. All code must pass the format and lint checks enforced by `deno fmt` and
   `deno lint` respectively. The build will only pass the tests if these
   conditions are met. Ignore rules will be accepted in the code base when their
   respective justification is given in a comment
4. All features and fixes must have a corresponding test added to be accepted

## Maintainers guidelines

When publishing a new version, ensure that the `version` field in `deno.json`
has been updated to match the new version.

## License

There are substantial parts of this library based on other libraries. They have
preserved their individual licenses and copyrights.

Everything is licensed under the MIT License.

All additional work is copyright 2018 - 2025 — Bartłomiej Iwańczuk, Steven
Guerrero, Hector Ayala — All rights reserved.
