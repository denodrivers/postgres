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

testClient(async function transaction() {
  // deno-lint-ignore camelcase
  const transaction_name = "x";
  const transaction = CLIENT.createTransaction(transaction_name);

  await transaction.begin();
  assertEquals(
    CLIENT.current_transaction,
    transaction_name,
    "Client is locked out during transaction",
  );
  await transaction.queryArray`CREATE TEMP TABLE TEST (X INTEGER)`;
  const savepoint = await transaction.savepoint("table_creation");
  await transaction.queryArray`INSERT INTO TEST (X) VALUES (1)`;
  // deno-lint-ignore camelcase
  const query_1 = await transaction.queryObject<{ x: number }>
    `SELECT X FROM TEST`;
  assertEquals(
    query_1.rows[0].x,
    1,
    "Operation was not executed inside transaction",
  );
  await transaction.rollback(savepoint);
  // deno-lint-ignore camelcase
  const query_2 = await transaction.queryObject<{ x: number }>
    `SELECT X FROM TEST`;
  assertEquals(
    query_2.rowCount,
    0,
    "Rollback was not succesful inside transaction",
  );
  await transaction.commit();
  assertEquals(
    CLIENT.current_transaction,
    null,
    "Client was not released after transaction",
  );
});

testClient(async function transactionLock() {
  const transaction = CLIENT.createTransaction("x");

  await transaction.begin();
  await transaction.queryArray`SELECT 1`;
  await assertThrowsAsync(
    () => CLIENT.queryArray`SELECT 1`,
    undefined,
    "This connection is currently locked",
    "The connection is not being locked by the transaction",
  );
  await transaction.commit();

  await CLIENT.queryArray`SELECT 1`;
  assertEquals(
    CLIENT.current_transaction,
    null,
    "Client was not released after transaction",
  );
});

testClient(async function transactionLockIsReleasedOnSavepointLessRollback() {
  const name = "transactionLockIsReleasedOnRollback";
  const transaction = CLIENT.createTransaction(name);

  await CLIENT.queryArray`CREATE TEMP TABLE MY_TEST (X INTEGER)`;
  await transaction.begin();
  await transaction.queryArray`INSERT INTO MY_TEST (X) VALUES (1)`;
  // deno-lint-ignore camelcase
  const { rows: query_1 } = await transaction.queryObject<{ x: number }>
    `SELECT X FROM MY_TEST`;
  assertEquals(query_1, [{ x: 1 }]);

  await transaction.rollback({ chain: true });

  assertEquals(
    CLIENT.current_transaction,
    name,
    "Client shouldn't have been released after chained rollback",
  );

  await transaction.rollback();

  // deno-lint-ignore camelcase
  const { rowCount: query_2 } = await CLIENT.queryObject<{ x: number }>
    `SELECT X FROM MY_TEST`;
  assertEquals(query_2, 0);

  assertEquals(
    CLIENT.current_transaction,
    null,
    "Client was not released after rollback",
  );
});

testClient(async function transactionRollbackValidations() {
  const transaction = CLIENT.createTransaction(
    "transactionRollbackValidations",
  );
  await transaction.begin();

  await assertThrowsAsync(
    // @ts-ignore This is made to check the two properties aren't passed at once
    () => transaction.rollback({ savepoint: "unexistent", chain: true }),
    undefined,
    "The chain option can't be used alongside a savepoint on a rollback operation",
  );

  await transaction.commit();
});

testClient(async function transactionLockIsReleasedOnUnrecoverableError() {
  const name = "transactionLockIsReleasedOnUnrecoverableError";
  const transaction = CLIENT.createTransaction(name);

  await transaction.begin();
  await assertThrowsAsync(
    () => transaction.queryArray`SELECT []`,
    undefined,
    `The transaction "${name}" has been aborted due to \`PostgresError:`,
  );
  assertEquals(CLIENT.current_transaction, null);

  await transaction.begin();
  await assertThrowsAsync(
    () => transaction.queryObject`SELECT []`,
    undefined,
    `The transaction "${name}" has been aborted due to \`PostgresError:`,
  );
  assertEquals(CLIENT.current_transaction, null);
});

testClient(async function transactionSavepoints() {
  // deno-lint-ignore camelcase
  const savepoint_name = "a1";
  const transaction = CLIENT.createTransaction("x");

  await transaction.begin();
  await transaction.queryArray`CREATE TEMP TABLE X (Y INT)`;
  await transaction.queryArray`INSERT INTO X VALUES (1)`;
  // deno-lint-ignore camelcase
  const { rows: query_1 } = await transaction.queryObject<{ y: number }>
    `SELECT Y FROM X`;
  assertEquals(query_1, [{ y: 1 }]);

  const savepoint = await transaction.savepoint(savepoint_name);

  await transaction.queryArray`DELETE FROM X`;
  // deno-lint-ignore camelcase
  const { rowCount: query_2 } = await transaction.queryObject<{ y: number }>
    `SELECT Y FROM X`;
  assertEquals(query_2, 0);

  await savepoint.update();

  await transaction.queryArray`INSERT INTO X VALUES (2)`;
  // deno-lint-ignore camelcase
  const { rows: query_3 } = await transaction.queryObject<{ y: number }>
    `SELECT Y FROM X`;
  assertEquals(query_3, [{ y: 2 }]);

  await transaction.rollback(savepoint);
  // deno-lint-ignore camelcase
  const { rowCount: query_4 } = await transaction.queryObject<{ y: number }>
    `SELECT Y FROM X`;
  assertEquals(query_4, 0);

  assertEquals(
    savepoint.instances,
    2,
    "An incorrect number of instances were created for a transaction savepoint",
  );
  await savepoint.release();
  assertEquals(
    savepoint.instances,
    1,
    "The instance for the savepoint was not released",
  );

  // This checks that the savepoint can be called by name as well
  await transaction.rollback(savepoint_name);
  // deno-lint-ignore camelcase
  const { rows: query_5 } = await transaction.queryObject<{ y: number }>
    `SELECT Y FROM X`;
  assertEquals(query_5, [{ y: 1 }]);

  await transaction.commit();
});

testClient(async function transactionSavepointValidations() {
  const transaction = CLIENT.createTransaction("x");
  await transaction.begin();

  await assertThrowsAsync(
    () => transaction.savepoint("1"),
    undefined,
    "The savepoint name can't begin with a number",
  );

  await assertThrowsAsync(
    () =>
      transaction.savepoint(
        "this_savepoint_is_going_to_be_longer_than_sixty_three_characters",
      ),
    undefined,
    "The savepoint name can't be longer than 63 characters",
  );

  await assertThrowsAsync(
    () => transaction.savepoint("+"),
    undefined,
    "The savepoint name can only contain alphanumeric characters",
  );

  const savepoint = await transaction.savepoint("ABC1");
  assertEquals(savepoint.name, "abc1");

  assertEquals(
    savepoint,
    await transaction.savepoint("abc1"),
    "Creating a savepoint with the same name should return the original one",
  );
  await savepoint.release();

  await savepoint.release();

  await assertThrowsAsync(
    () => savepoint.release(),
    undefined,
    "This savepoint has no instances to release",
  );

  await assertThrowsAsync(
    () => transaction.rollback(savepoint),
    undefined,
    `There are no savepoints of "abc1" left to rollback to`,
  );

  await assertThrowsAsync(
    () => transaction.rollback("UNEXISTENT"),
    undefined,
    `There is no "unexistent" savepoint registered in this transaction`,
  );

  await transaction.commit();
});

testClient(async function transactionOperationsThrowIfTransactionNotBegun() {
  // deno-lint-ignore camelcase
  const transaction_x = CLIENT.createTransaction("x");
  // deno-lint-ignore camelcase
  const transaction_y = CLIENT.createTransaction("y");

  await transaction_x.begin();

  await assertThrowsAsync(
    () => transaction_y.begin(),
    undefined,
    `This client already has an ongoing transaction "x"`,
  );

  await transaction_x.commit();
  await transaction_y.begin();
  await assertThrowsAsync(
    () => transaction_y.begin(),
    undefined,
    "This transaction is already open",
  );

  await transaction_y.commit();
  await assertThrowsAsync(
    () => transaction_y.commit(),
    undefined,
    `This transaction has not been started yet, make sure to use the "begin" method to do so`,
  );

  await assertThrowsAsync(
    () => transaction_y.commit(),
    undefined,
    `This transaction has not been started yet, make sure to use the "begin" method to do so`,
  );

  await assertThrowsAsync(
    () => transaction_y.queryArray`SELECT 1`,
    undefined,
    `This transaction has not been started yet, make sure to use the "begin" method to do so`,
  );

  await assertThrowsAsync(
    () => transaction_y.queryObject`SELECT 1`,
    undefined,
    `This transaction has not been started yet, make sure to use the "begin" method to do so`,
  );

  await assertThrowsAsync(
    () => transaction_y.rollback(),
    undefined,
    `This transaction has not been started yet, make sure to use the "begin" method to do so`,
  );

  await assertThrowsAsync(
    () => transaction_y.savepoint("SOME"),
    undefined,
    `This transaction has not been started yet, make sure to use the "begin" method to do so`,
  );
});
