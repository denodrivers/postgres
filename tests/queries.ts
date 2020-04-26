import { Client } from "../mod.ts";
import { assertEquals } from "../test_deps.ts";
import { DEFAULT_SETUP, TEST_CONNECTION_PARAMS } from "./constants.ts";
import { getTestClient } from "./helpers.ts";

const CLIENT = new Client(TEST_CONNECTION_PARAMS);

const testClient = getTestClient(CLIENT, DEFAULT_SETUP);

testClient(async function simpleQuery() {
  const result = await CLIENT.query("SELECT * FROM ids;");
  assertEquals(result.rows.length, 2);
});

testClient(async function parametrizedQuery() {
  const result = await CLIENT.query("SELECT * FROM ids WHERE id < $1;", 2);
  assertEquals(result.rows.length, 1);

  const objectRows = result.rowsOfObjects();
  const row = objectRows[0];

  assertEquals(row.id, 1);
  assertEquals(typeof row.id, "number");
});

testClient(async function nativeType() {
  const result = await CLIENT.query("SELECT * FROM timestamps;");
  const row = result.rows[0];

  const expectedDate = Date.UTC(2019, 1, 10, 6, 0, 40, 5);

  assertEquals(row[0].toUTCString(), new Date(expectedDate).toUTCString());

  await CLIENT.query("INSERT INTO timestamps(dt) values($1);", new Date());
});

testClient(async function binaryType() {
  const result = await CLIENT.query("SELECT * from bytes;");
  const row = result.rows[0];

  const expectedBytes = new Uint8Array([102, 111, 111, 0, 128, 92, 255]);

  assertEquals(row[0], expectedBytes);

  await CLIENT.query(
    "INSERT INTO bytes VALUES($1);",
    { args: expectedBytes },
  );
});

// MultiQueries

testClient(async function multiQueryWithOne() {
  const result = await CLIENT.multiQuery([{ text: "SELECT * from bytes;" }]);
  const row = result[0].rows[0];

  const expectedBytes = new Uint8Array([102, 111, 111, 0, 128, 92, 255]);

  assertEquals(row[0], expectedBytes);

  await CLIENT.multiQuery([{
    text: "INSERT INTO bytes VALUES($1);",
    args: [expectedBytes],
  }]);
});

testClient(async function multiQueryWithManyString() {
  const result = await CLIENT.multiQuery([
    { text: "SELECT * from bytes;" },
    { text: "SELECT * FROM timestamps;" },
    { text: "SELECT * FROM ids;" },
  ]);
  assertEquals(result.length, 3);

  const expectedBytes = new Uint8Array([102, 111, 111, 0, 128, 92, 255]);

  assertEquals(result[0].rows[0][0], expectedBytes);

  const expectedDate = Date.UTC(2019, 1, 10, 6, 0, 40, 5);

  assertEquals(
    result[1].rows[0][0].toUTCString(),
    new Date(expectedDate).toUTCString(),
  );

  assertEquals(result[2].rows.length, 2);

  await CLIENT.multiQuery([{
    text: "INSERT INTO bytes VALUES($1);",
    args: [expectedBytes],
  }]);
});

testClient(async function multiQueryWithManyStringArray() {
  const result = await CLIENT.multiQuery([
    { text: "SELECT * from bytes;" },
    { text: "SELECT * FROM timestamps;" },
    { text: "SELECT * FROM ids;" },
  ]);

  assertEquals(result.length, 3);

  const expectedBytes = new Uint8Array([102, 111, 111, 0, 128, 92, 255]);

  assertEquals(result[0].rows[0][0], expectedBytes);

  const expectedDate = Date.UTC(2019, 1, 10, 6, 0, 40, 5);

  assertEquals(
    result[1].rows[0][0].toUTCString(),
    new Date(expectedDate).toUTCString(),
  );

  assertEquals(result[2].rows.length, 2);
});

testClient(async function multiQueryWithManyQueryTypeArray() {
  const result = await CLIENT.multiQuery([
    { text: "SELECT * from bytes;" },
    { text: "SELECT * FROM timestamps;" },
    { text: "SELECT * FROM ids;" },
  ]);

  assertEquals(result.length, 3);

  const expectedBytes = new Uint8Array([102, 111, 111, 0, 128, 92, 255]);

  assertEquals(result[0].rows[0][0], expectedBytes);

  const expectedDate = Date.UTC(2019, 1, 10, 6, 0, 40, 5);

  assertEquals(
    result[1].rows[0][0].toUTCString(),
    new Date(expectedDate).toUTCString(),
  );

  assertEquals(result[2].rows.length, 2);
});
