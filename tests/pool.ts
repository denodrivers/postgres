import { test, assertEqual } from "../deps.ts";
import { Client } from "../mod.ts";
import { ConnectionPool } from "../pool.ts";

let testPool: ConnectionPool;

async function getTestPool(): Promise<ConnectionPool> {
  if (testPool) {
    return testPool;
  }

  testPool = new ConnectionPool(1, {
    user: "postgres",
    password: "postgres",
    database: "deno_postgres",
    host: "localhost",
    port: "5432"
  });
  await testPool.startup();

  // testPool = await testClient.pool(10);
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

  await pool.query(
    "INSERT INTO timestamps(dt) values($1);",
    new Date("2019-01-01")
  );

  const fqueries = [...Array(2)].map(() => pool.query("SELECT * FROM timestamps;"));
  const queries = await Promise.all(fqueries);
  
  const row = queries[0].rows[0];
  const expectedDate = Date.UTC(2019, 1, 10, 6, 0, 40, 5);

  assertEqual(
      row[0].toUTCString(),
      new Date(expectedDate).toUTCString()
  )
});

test(async function tearDown() {
  await testPool.close();
});
