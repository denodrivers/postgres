import { test, assertEqual, TestFunction } from "../deps.ts";
import { Client } from "../mod.ts";
import { Pool } from "../pool.ts";
import { delay } from "../utils.ts";
import { DEFAULT_PARAMS, DEFAULT_SETUP } from "./queries.ts";

let POOL: Pool;

async function testPool(t: TestFunction, setupQueries?: Array<string>) {
  // constructing Pool instantiates the connections,
  // so this has to be constructed for each test.
  const fn = async () => {
    POOL = new Pool(DEFAULT_PARAMS, 10);
    try {
      for (const q of setupQueries || DEFAULT_SETUP) {
        await POOL.query(q);
      }
      await t();
    } finally {
      await POOL.end();
    }
    POOL = undefined;
  };
  const name = t.name;
  test({ fn, name });
}

testPool(async function simpleQuery() {
  const result = await POOL.query("SELECT * FROM ids;");
  assertEqual(result.rows.length, 2);
});

testPool(async function parametrizedQuery() {
  const result = await POOL.query("SELECT * FROM ids WHERE id < $1;", 2);
  assertEqual(result.rows.length, 1);

  const objectRows = result.rowsOfObjects();
  const row = objectRows[0];

  assertEqual(row.id, 1);
  assertEqual(typeof row.id, "number");
});

testPool(async function nativeType() {
  const result = await POOL.query("SELECT * FROM timestamps;");
  const row = result.rows[0];

  const expectedDate = Date.UTC(2019, 1, 10, 6, 0, 40, 5);

  assertEqual(row[0].toUTCString(), new Date(expectedDate).toUTCString());

  await POOL.query("INSERT INTO timestamps(dt) values($1);", new Date());
});

testPool(async function manyQueries() {
  assertEqual(POOL.available, 10);
  const p = POOL.query("SELECT pg_sleep(0.1) is null, -1 AS id;");
  await delay(1);
  assertEqual(POOL.available, 9);
  await p;
  assertEqual(POOL.available, 10);

  const qs_thunks = [...Array(25)].map((_, i) =>
    POOL.query("SELECT pg_sleep(0.1) is null, $1::text as id;", i)
  );
  const qs_promises = Promise.all(qs_thunks);
  await delay(1);
  assertEqual(POOL.available, 0);
  const qs = await qs_promises;
  assertEqual(POOL.available, 10);

  const result = qs.map(r => r.rows[0][1]);
  const expected = [...Array(25)].map((_, i) => i.toString());
  assertEqual(result, expected);
});

testPool(async function transaction() {
  const client = await POOL.connect();
  let errored;
  let released;
  assertEqual(POOL.available, 9);

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
  assertEqual(POOL.available, 10);
});
