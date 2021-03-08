import { Client } from "../mod.ts";
import { assert, assertEquals, assertThrowsAsync } from "./test_deps.ts";
import { DEFAULT_SETUP } from "./constants.ts";
import { getMainConfiguration } from "./config.ts";
import { getTestClient } from "./helpers.ts";

const CLIENT = new Client(getMainConfiguration());

const testClient = getTestClient(CLIENT, DEFAULT_SETUP);

testClient(async function simpleQuery() {
  const result = await CLIENT.queryArray("SELECT * FROM ids;");
  assertEquals(result.rows.length, 2);
});

testClient(async function parametrizedQuery() {
  const result = await CLIENT.queryObject(
    "SELECT * FROM ids WHERE id < $1;",
    2,
  );
  assertEquals(result.rows, [{ id: 1 }]);
});

testClient(async function objectQuery() {
  const result = await CLIENT.queryObject(
    "SELECT ARRAY[1, 2, 3] AS IDS, 'DATA' AS TYPE",
  );

  assertEquals(result.rows, [{ ids: [1, 2, 3], type: "DATA" }]);
});

testClient(async function aliasedObjectQuery() {
  const result = await CLIENT.queryObject({
    text: "SELECT ARRAY[1, 2, 3], 'DATA'",
    fields: ["IDS", "type"],
  });

  assertEquals(result.rows, [{ ids: [1, 2, 3], type: "DATA" }]);
});

testClient(async function objectQueryThrowsOnRepeatedFields() {
  await assertThrowsAsync(
    async () => {
      await CLIENT.queryObject({
        text: "SELECT 1",
        fields: ["FIELD_1", "FIELD_1"],
      });
    },
    TypeError,
    "The fields provided for the query must be unique",
  );
});

testClient(async function objectQueryThrowsOnNotMatchingFields() {
  await assertThrowsAsync(
    async () => {
      await CLIENT.queryObject({
        text: "SELECT 1",
        fields: ["FIELD_1", "FIELD_2"],
      });
    },
    RangeError,
    "The fields provided for the query don't match the ones returned as a result (1 expected, 2 received)",
  );
});

testClient(async function handleDebugNotice() {
  const { rows, warnings } = await CLIENT.queryArray(
    "SELECT * FROM CREATE_NOTICE();",
  );
  assertEquals(rows[0][0], 1);
  assertEquals(warnings[0].message, "NOTICED");
});

// This query doesn't recreate the table and outputs
// a notice instead
testClient(async function handleQueryNotice() {
  await CLIENT.queryArray(
    "CREATE TEMP TABLE NOTICE_TEST (ABC INT);",
  );
  const { warnings } = await CLIENT.queryArray(
    "CREATE TEMP TABLE IF NOT EXISTS NOTICE_TEST (ABC INT);",
  );

  assert(warnings[0].message.includes("already exists"));
});

testClient(async function nativeType() {
  const result = await CLIENT.queryArray<[Date]>("SELECT * FROM timestamps;");
  const row = result.rows[0];

  const expectedDate = Date.UTC(2019, 1, 10, 6, 0, 40, 5);

  assertEquals(row[0].toUTCString(), new Date(expectedDate).toUTCString());

  await CLIENT.queryArray("INSERT INTO timestamps(dt) values($1);", new Date());
});

testClient(async function binaryType() {
  const result = await CLIENT.queryArray("SELECT * from bytes;");
  const row = result.rows[0];

  const expectedBytes = new Uint8Array([102, 111, 111, 0, 128, 92, 255]);

  assertEquals(row[0], expectedBytes);

  await CLIENT.queryArray(
    "INSERT INTO bytes VALUES($1);",
    { args: expectedBytes },
  );
});

testClient(async function resultMetadata() {
  let result;

  // simple select
  result = await CLIENT.queryArray("SELECT * FROM ids WHERE id = 100");
  assertEquals(result.command, "SELECT");
  assertEquals(result.rowCount, 1);

  // parameterized select
  result = await CLIENT.queryArray(
    "SELECT * FROM ids WHERE id IN ($1, $2)",
    200,
    300,
  );
  assertEquals(result.command, "SELECT");
  assertEquals(result.rowCount, 2);

  // simple delete
  result = await CLIENT.queryArray("DELETE FROM ids WHERE id IN (100, 200)");
  assertEquals(result.command, "DELETE");
  assertEquals(result.rowCount, 2);

  // parameterized delete
  result = await CLIENT.queryArray("DELETE FROM ids WHERE id = $1", 300);
  assertEquals(result.command, "DELETE");
  assertEquals(result.rowCount, 1);

  // simple insert
  result = await CLIENT.queryArray("INSERT INTO ids VALUES (4), (5)");
  assertEquals(result.command, "INSERT");
  assertEquals(result.rowCount, 2);

  // parameterized insert
  result = await CLIENT.queryArray("INSERT INTO ids VALUES ($1)", 3);
  assertEquals(result.command, "INSERT");
  assertEquals(result.rowCount, 1);

  // simple update
  result = await CLIENT.queryArray(
    "UPDATE ids SET id = 500 WHERE id IN (500, 600)",
  );
  assertEquals(result.command, "UPDATE");
  assertEquals(result.rowCount, 2);

  // parameterized update
  result = await CLIENT.queryArray(
    "UPDATE ids SET id = 400 WHERE id = $1",
    400,
  );
  assertEquals(result.command, "UPDATE");
  assertEquals(result.rowCount, 1);
}, [
  "DROP TABLE IF EXISTS ids",
  "CREATE UNLOGGED TABLE ids (id integer)",
  "INSERT INTO ids VALUES (100), (200), (300), (400), (500), (600)",
]);

testClient(async function transactionWithConcurrentQueries() {
  const result = await CLIENT.queryArray("BEGIN");

  assertEquals(result.rows.length, 0);
  const concurrentCount = 5;
  const queries = [...Array(concurrentCount)].map((_, i) => {
    return CLIENT.queryArray({
      text: "INSERT INTO ids (id) VALUES ($1) RETURNING id;",
      args: [i],
    });
  });
  const results = await Promise.all(queries);

  results.forEach((r, i) => {
    assertEquals(r.rows[0][0], i);
  });
});

testClient(async function handleNameTooLongError() {
  const result = await CLIENT.queryObject(`
    SELECT 1 AS "very_very_very_very_very_very_very_very_very_very_very_long_name"
  `);
  assertEquals(result.rows, [
    { "very_very_very_very_very_very_very_very_very_very_very_long_nam": 1 },
  ]);
});

testClient(async function templateStringQueryObject() {
  const value = { x: "A", y: "B" };

  const { rows } = await CLIENT.queryObject<{ x: string; y: string }>
    `SELECT ${value.x} AS X, ${value.y} AS Y`;

  assertEquals(rows[0], value);
});

testClient(async function templateStringQueryArray() {
  // deno-lint-ignore camelcase
  const [value_1, value_2] = ["A", "B"];

  const { rows } = await CLIENT.queryArray<[string, string]>
    `SELECT ${value_1}, ${value_2}`;

  assertEquals(rows[0], [value_1, value_2]);
});
