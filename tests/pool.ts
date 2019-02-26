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
  return testPool;
}

// TODO: replace this with "setUp" once it lands in "testing" module
test(async function beforeEach() {
  const pool = await getTestPool();

  await pool.query("DROP TABLE IF EXISTS ids;");
  await pool.query("CREATE TABLE ids(id integer);");
  await pool.query("INSERT INTO ids(id) VALUES(1);");
  await pool.query("INSERT INTO ids(id) VALUES(2);");

  await pool.query("DROP TABLE IF EXISTS timestamps;");
  await pool.query("CREATE TABLE timestamps(dt timestamptz);");
  await pool.query(
    `INSERT INTO timestamps(dt) VALUES('2019-02-10T10:30:40.005+04:30');`
  );
});

test(async function simpleQuery() {
  const pool = await getTestPool();

  const result = await pool.query("SELECT * FROM ids;");
  assertEqual(result.rows.length, 2);
});

test(async function parametrizedQuery() {
  const pool = await getTestPool();

  const result = await pool.query("SELECT * FROM ids WHERE id < $1;", 2);
  assertEqual(result.rows.length, 1);

  const objectRows = result.rowsOfObjects();
  const row = objectRows[0];

  assertEqual(row.id, 1);
  assertEqual(typeof row.id, "number");
});

test(async function nativeType() {
  const pool = await getTestPool();

  const result = await pool.query("SELECT * FROM timestamps;");
  const row = result.rows[0];

  const expectedDate = Date.UTC(2019, 1, 10, 6, 0, 40, 5);

  assertEqual(row[0].toUTCString(), new Date(expectedDate).toUTCString());

  await pool.query("INSERT INTO timestamps(dt) values($1);", new Date());
});

test(async function manyQueries() {
  const pool = await getTestPool();

  assertEqual(pool.available, 10);
  const p = pool.query("SELECT pg_sleep(0.1) is null, -1 AS id;");
  await delay(1);
  assertEqual(pool.available, 9);
  await p;
  assertEqual(pool.available, 10);

  const qs_thunks = [...Array(25)].map((_, i) =>
    pool.query("SELECT pg_sleep(0.1) is null, $1::text as id;", i)
  );
  const qs_promises = Promise.all(qs_thunks);
  await delay(1);
  assertEqual(pool.available, 0);
  const qs = await qs_promises;
  assertEqual(pool.available, 10);

  const result = qs.map(r => r.rows[0][1]);
  const expected = [...Array(25)].map((_, i) => i.toString());
  assertEqual(result, expected);
});

test(async function transaction() {
  const client = await testPool.connect();
  let errored;
  let released;
  assertEqual(testPool.available, 9);

  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO timestamps(dt) values($1);", new Date());
    await client.query("INSERT INTO ids(id) VALUES(3);");
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    errored = true;
    throw e;
  } finally {
    client.release();
    released = true;
  }
  assertEqual(errored, undefined);
  assertEqual(released, true);
  assertEqual(testPool.available, 10);
});

test(async function tearDown() {
  await testPool.end();
});
