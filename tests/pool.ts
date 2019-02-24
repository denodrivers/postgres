import { test, assertEqual } from "../deps.ts";
import { Client } from "../mod.ts";
import { Pool } from "../pool.ts";
import { delay } from "../utils.ts";

let testPool: Pool;

async function getTestPool(): Promise<Pool> {
  if (testPool) {
    return testPool;
  }

  testPool = new Pool(
    {
      user: "postgres",
      password: "postgres",
      database: "deno_postgres",
      host: "localhost",
      port: "5432"
    },
    10
  );
  await testPool._ready;
  return testPool;
}

// TODO: replace this with "setUp" once it lands in "testing" module
test(async function beforeEach() {
  const client = await getTestPool();

  await client.query("DROP TABLE IF EXISTS ids;");
  await client.query("CREATE TABLE ids(id integer);");
  await client.query("INSERT INTO ids(id) VALUES(1);");
  await client.query("INSERT INTO ids(id) VALUES(2);");

  await client.query("DROP TABLE IF EXISTS timestamps;");
  await client.query("CREATE TABLE timestamps(dt timestamptz);");
  await client.query(
    `INSERT INTO timestamps(dt) VALUES('2019-02-10T10:30:40.005+04:30');`
  );
});

test(async function simpleQuery() {
  const client = await getTestPool();

  const result = await client.query("SELECT * FROM ids;");
  assertEqual(result.rows.length, 2);
});

test(async function parametrizedQuery() {
  const client = await getTestPool();

  const result = await client.query("SELECT * FROM ids WHERE id < $1;", 2);
  assertEqual(result.rows.length, 1);

  const objectRows = result.rowsOfObjects();
  const row = objectRows[0];

  assertEqual(row.id, 1);
  assertEqual(typeof row.id, "number");
});

test(async function nativeType() {
  const client = await getTestPool();

  const result = await client.query("SELECT * FROM timestamps;");
  const row = result.rows[0];

  const expectedDate = Date.UTC(2019, 1, 10, 6, 0, 40, 5);

  assertEqual(row[0].toUTCString(), new Date(expectedDate).toUTCString());

  await client.query("INSERT INTO timestamps(dt) values($1);", new Date());
});

test(async function manyQueries() {
  const client = await getTestPool();

  assertEqual(client.available, 10);
  const p = client.query("SELECT pg_sleep(0.1) is null, -1 AS id;");
  await delay(1);
  assertEqual(client.available, 9);
  await p;
  assertEqual(client.available, 10);

  const qs_thunks = [...Array(25)].map((_, i) =>
    client.query("SELECT pg_sleep(0.1) is null, $1::text as id;", i)
  );
  const qs_promises = Promise.all(qs_thunks);
  await delay(1);
  assertEqual(client.available, 0);
  const qs = await qs_promises;
  assertEqual(client.available, 10);

  const result = qs.map(r => r.rows[0][1]);
  const expected = [...Array(25)].map((_, i) => i.toString());
  assertEqual(result, expected);
});

test(async function tearDown() {
  await testPool.end();
});
