import { assertEquals, assertThrowsAsync, delay } from "./test_deps.ts";
import { Pool } from "../pool.ts";
import { DEFAULT_SETUP } from "./constants.ts";
import { getMainConfiguration } from "./config.ts";

function testPool(
  t: (pool: Pool) => void | Promise<void>,
  lazy?: boolean,
) {
  // constructing Pool instantiates the connections,
  // so this has to be constructed for each test.
  const fn = async () => {
    const POOL = new Pool(getMainConfiguration(), 10, lazy);
    try {
      for (const q of DEFAULT_SETUP) {
        const client = await POOL.connect();
        await client.queryArray(q);
        await client.release();
      }
      await t(POOL);
    } finally {
      await POOL.end();
    }
  };
  const name = t.name;
  Deno.test({ fn, name });
}

testPool(async function simpleQuery(POOL) {
  const client = await POOL.connect();
  const result = await client.queryArray`SELECT * FROM ids`;
  assertEquals(result.rows.length, 2);
  await client.release();
});

testPool(async function parametrizedQuery(POOL) {
  const client = await POOL.connect();
  const result = await client.queryObject(
    "SELECT * FROM ids WHERE id < $1",
    2,
  );
  assertEquals(result.rows, [{ id: 1 }]);
  await client.release();
});

testPool(async function aliasedObjectQuery(POOL) {
  const client = await POOL.connect();
  const result = await client.queryObject({
    text: "SELECT ARRAY[1, 2, 3], 'DATA'",
    fields: ["IDS", "type"],
  });

  assertEquals(result.rows, [{ ids: [1, 2, 3], type: "DATA" }]);
  await client.release();
});

testPool(async function objectQueryThrowsOnRepeatedFields(POOL) {
  const client = await POOL.connect();
  await assertThrowsAsync(
    async () => {
      await client.queryObject({
        text: "SELECT 1",
        fields: ["FIELD_1", "FIELD_1"],
      });
    },
    TypeError,
    "The fields provided for the query must be unique",
  )
    .finally(() => client.release());
});

testPool(async function objectQueryThrowsOnNotMatchingFields(POOL) {
  const client = await POOL.connect();
  await assertThrowsAsync(
    async () => {
      await client.queryObject({
        text: "SELECT 1",
        fields: ["FIELD_1", "FIELD_2"],
      });
    },
    RangeError,
    "The fields provided for the query don't match the ones returned as a result (1 expected, 2 received)",
  )
    .finally(() => client.release());
});

testPool(async function nativeType(POOL) {
  const client = await POOL.connect();
  const result = await client.queryArray<[Date]>("SELECT * FROM timestamps");
  const row = result.rows[0];

  const expectedDate = Date.UTC(2019, 1, 10, 6, 0, 40, 5);

  assertEquals(row[0].toUTCString(), new Date(expectedDate).toUTCString());

  await client.queryArray("INSERT INTO timestamps(dt) values($1)", new Date());
  await client.release();
});

testPool(
  async function lazyPool(POOL) {
    // deno-lint-ignore camelcase
    const client_1 = await POOL.connect();
    await client_1.queryArray("SELECT 1");
    await client_1.release();
    assertEquals(POOL.available, 1);

    // deno-lint-ignore camelcase
    const client_2 = await POOL.connect();
    const p = client_2.queryArray("SELECT pg_sleep(0.1) is null, -1 AS id");
    await delay(1);
    assertEquals(POOL.available, 0);
    assertEquals(POOL.size, 1);
    await p;
    await client_2.release();
    assertEquals(POOL.available, 1);

    const qsThunks = [...Array(25)].map(async (_, i) => {
      const client = await POOL.connect();
      const query = await client.queryArray(
        "SELECT pg_sleep(0.1) is null, $1::text as id",
        i,
      );
      await client.release();
      return query;
    });
    const qsPromises = Promise.all(qsThunks);
    await delay(1);
    assertEquals(POOL.available, 0);
    const qs = await qsPromises;
    assertEquals(POOL.available, 10);
    assertEquals(POOL.size, 10);

    const result = qs.map((r) => r.rows[0][1]);
    const expected = [...Array(25)].map((_, i) => i.toString());
    assertEquals(result, expected);
  },
  true,
);

testPool(async function manyQueries(POOL) {
  assertEquals(POOL.available, 10);
  const client = await POOL.connect();
  const p = client.queryArray("SELECT pg_sleep(0.1) is null, -1 AS id");
  await delay(1);
  assertEquals(POOL.available, 9);
  assertEquals(POOL.size, 10);
  await p;
  await client.release();
  assertEquals(POOL.available, 10);

  const qsThunks = [...Array(25)].map(async (_, i) => {
    const client = await POOL.connect();
    const query = await client.queryArray(
      "SELECT pg_sleep(0.1) is null, $1::text as id",
      i,
    );
    await client.release();
    return query;
  });
  const qsPromises = Promise.all(qsThunks);
  await delay(1);
  assertEquals(POOL.available, 0);
  const qs = await qsPromises;
  assertEquals(POOL.available, 10);
  assertEquals(POOL.size, 10);

  const result = qs.map((r) => r.rows[0][1]);
  const expected = [...Array(25)].map((_, i) => i.toString());
  assertEquals(result, expected);
});

testPool(async function transaction(POOL) {
  const client = await POOL.connect();
  // deno-lint-ignore camelcase
  const transaction_name = "x";
  const transaction = client.createTransaction(transaction_name);

  await transaction.begin();
  assertEquals(
    client.current_transaction,
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
    client.current_transaction,
    null,
    "Client was not released after transaction",
  );
  await client.release();
});

testPool(async function transactionIsolationLevelRepeatableRead(POOL) {
  // deno-lint-ignore camelcase
  const client_1 = await POOL.connect();
  // deno-lint-ignore camelcase
  const client_2 = await POOL.connect();

  await client_1.queryArray`DROP TABLE IF EXISTS FOR_TRANSACTION_TEST`;
  await client_1.queryArray`CREATE TABLE FOR_TRANSACTION_TEST (X INTEGER)`;
  await client_1.queryArray`INSERT INTO FOR_TRANSACTION_TEST (X) VALUES (1)`;
  // deno-lint-ignore camelcase
  const transaction_rr = client_1.createTransaction(
    "transactionIsolationLevelRepeatableRead",
    { isolation_level: "repeatable_read" },
  );
  await transaction_rr.begin();

  // This locks the current value of the test table
  await transaction_rr.queryObject<{ x: number }>
    `SELECT X FROM FOR_TRANSACTION_TEST`;

  // Modify data outside the transaction
  await client_2.queryArray`UPDATE FOR_TRANSACTION_TEST SET X = 2`;
  // deno-lint-ignore camelcase
  const { rows: query_1 } = await client_2.queryObject<{ x: number }>
    `SELECT X FROM FOR_TRANSACTION_TEST`;
  assertEquals(query_1, [{ x: 2 }]);

  // deno-lint-ignore camelcase
  const { rows: query_2 } = await transaction_rr.queryObject<
    { x: number }
  >`SELECT X FROM FOR_TRANSACTION_TEST`;
  assertEquals(
    query_2,
    [{ x: 1 }],
    "Repeatable read transaction should not be able to observe changes that happened after the transaction start",
  );

  await transaction_rr.commit();

  // deno-lint-ignore camelcase
  const { rows: query_3 } = await client_1.queryObject<{ x: number }>
    `SELECT X FROM FOR_TRANSACTION_TEST`;
  assertEquals(
    query_3,
    [{ x: 2 }],
    "Main session should be able to observe changes after transaction ended",
  );

  await client_1.queryArray`DROP TABLE FOR_TRANSACTION_TEST`;

  await client_1.release();
  await client_2.release();
});

testPool(async function transactionIsolationLevelSerializable(POOL) {
  // deno-lint-ignore camelcase
  const client_1 = await POOL.connect();
  // deno-lint-ignore camelcase
  const client_2 = await POOL.connect();

  await client_1.queryArray`DROP TABLE IF EXISTS FOR_TRANSACTION_TEST`;
  await client_1.queryArray`CREATE TABLE FOR_TRANSACTION_TEST (X INTEGER)`;
  await client_1.queryArray`INSERT INTO FOR_TRANSACTION_TEST (X) VALUES (1)`;
  // deno-lint-ignore camelcase
  const transaction_rr = client_1.createTransaction(
    "transactionIsolationLevelRepeatableRead",
    { isolation_level: "serializable" },
  );
  await transaction_rr.begin();

  // This locks the current value of the test table
  await transaction_rr.queryObject<{ x: number }>
    `SELECT X FROM FOR_TRANSACTION_TEST`;

  // Modify data outside the transaction
  await client_2.queryArray`UPDATE FOR_TRANSACTION_TEST SET X = 2`;

  await assertThrowsAsync(
    () => transaction_rr.queryArray`UPDATE FOR_TRANSACTION_TEST SET X = 3`,
    undefined,
    undefined,
    "A serializable transaction should throw if the data read in the transaction has been modified externally",
  );

  // deno-lint-ignore camelcase
  const { rows: query_3 } = await client_1.queryObject<{ x: number }>
    `SELECT X FROM FOR_TRANSACTION_TEST`;
  assertEquals(
    query_3,
    [{ x: 2 }],
    "Main session should be able to observe changes after transaction ended",
  );

  await client_1.queryArray`DROP TABLE FOR_TRANSACTION_TEST`;

  await client_1.release();
  await client_2.release();
});

testPool(async function transactionReadOnly(POOL) {
  const client = await POOL.connect();

  await client.queryArray`DROP TABLE IF EXISTS FOR_TRANSACTION_TEST`;
  await client.queryArray`CREATE TABLE FOR_TRANSACTION_TEST (X INTEGER)`;
  const transaction = client.createTransaction("transactionReadOnly", {
    read_only: true,
  });
  await transaction.begin();

  await assertThrowsAsync(
    () => transaction.queryArray`DELETE FROM FOR_TRANSACTION_TEST`,
    undefined,
    "cannot execute DELETE in a read-only transaction",
  );

  await client.queryArray`DROP TABLE FOR_TRANSACTION_TEST`;

  await client.release();
});

testPool(async function transactionSnapshot(POOL) {
  // deno-lint-ignore camelcase
  const client_1 = await POOL.connect();
  // deno-lint-ignore camelcase
  const client_2 = await POOL.connect();

  await client_1.queryArray`DROP TABLE IF EXISTS FOR_TRANSACTION_TEST`;
  await client_1.queryArray`CREATE TABLE FOR_TRANSACTION_TEST (X INTEGER)`;
  await client_1.queryArray`INSERT INTO FOR_TRANSACTION_TEST (X) VALUES (1)`;
  // deno-lint-ignore camelcase
  const transaction_1 = client_1.createTransaction(
    "transactionSnapshot1",
    { isolation_level: "repeatable_read" },
  );
  await transaction_1.begin();

  // This locks the current value of the test table
  await transaction_1.queryObject<{ x: number }>
    `SELECT X FROM FOR_TRANSACTION_TEST`;

  // Modify data outside the transaction
  await client_2.queryArray`UPDATE FOR_TRANSACTION_TEST SET X = 2`;

  // deno-lint-ignore camelcase
  const { rows: query_1 } = await transaction_1.queryObject<{ x: number }>
    `SELECT X FROM FOR_TRANSACTION_TEST`;
  assertEquals(
    query_1,
    [{ x: 1 }],
    "External changes shouldn't affect repeatable read transaction",
  );

  const snapshot = await transaction_1.getSnapshot();

  // deno-lint-ignore camelcase
  const transaction_2 = client_2.createTransaction(
    "transactionSnapshot2",
    { isolation_level: "repeatable_read", snapshot },
  );
  await transaction_2.begin();

  // deno-lint-ignore camelcase
  const { rows: query_2 } = await transaction_2.queryObject<{ x: number }>
    `SELECT X FROM FOR_TRANSACTION_TEST`;
  assertEquals(
    query_2,
    [{ x: 1 }],
    "External changes shouldn't affect repeatable read transaction with previous snapshot",
  );

  await transaction_1.commit();
  await transaction_2.commit();

  await client_1.queryArray`DROP TABLE FOR_TRANSACTION_TEST`;

  await client_1.release();
  await client_2.release();
});

testPool(async function transactionLock(POOL) {
  const client = await POOL.connect();

  const transaction = client.createTransaction("x");

  await transaction.begin();
  await transaction.queryArray`SELECT 1`;
  await assertThrowsAsync(
    () => client.queryArray`SELECT 1`,
    undefined,
    "This connection is currently locked",
    "The connection is not being locked by the transaction",
  );
  await transaction.commit();

  await client.queryArray`SELECT 1`;
  assertEquals(
    client.current_transaction,
    null,
    "Client was not released after transaction",
  );

  await client.release();
});

testPool(async function transactionCommitChain(POOL) {
  const client = await POOL.connect();

  const name = "transactionCommitChain";
  const transaction = client.createTransaction(name);

  await transaction.begin();

  await transaction.commit({ chain: true });
  assertEquals(
    client.current_transaction,
    name,
    "Client shouldn't have been released on chained commit",
  );

  await transaction.commit();
  assertEquals(
    client.current_transaction,
    null,
    "Client was not released after transaction ended",
  );

  await client.release();
});

testPool(async function transactionLockIsReleasedOnSavepointLessRollback(POOL) {
  const client = await POOL.connect();

  const name = "transactionLockIsReleasedOnRollback";
  const transaction = client.createTransaction(name);

  await client.queryArray`CREATE TEMP TABLE MY_TEST (X INTEGER)`;
  await transaction.begin();
  await transaction.queryArray`INSERT INTO MY_TEST (X) VALUES (1)`;
  // deno-lint-ignore camelcase
  const { rows: query_1 } = await transaction.queryObject<{ x: number }>
    `SELECT X FROM MY_TEST`;
  assertEquals(query_1, [{ x: 1 }]);

  await transaction.rollback({ chain: true });

  assertEquals(
    client.current_transaction,
    name,
    "Client shouldn't have been released after chained rollback",
  );

  await transaction.rollback();

  // deno-lint-ignore camelcase
  const { rowCount: query_2 } = await client.queryObject<{ x: number }>
    `SELECT X FROM MY_TEST`;
  assertEquals(query_2, 0);

  assertEquals(
    client.current_transaction,
    null,
    "Client was not released after rollback",
  );

  await client.release();
});

testPool(async function transactionRollbackValidations(POOL) {
  const client = await POOL.connect();

  const transaction = client.createTransaction(
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

  await client.release();
});

testPool(async function transactionLockIsReleasedOnUnrecoverableError(POOL) {
  const client = await POOL.connect();

  const name = "transactionLockIsReleasedOnUnrecoverableError";
  const transaction = client.createTransaction(name);

  await transaction.begin();
  await assertThrowsAsync(
    () => transaction.queryArray`SELECT []`,
    undefined,
    `The transaction "${name}" has been aborted due to \`PostgresError:`,
  );
  assertEquals(client.current_transaction, null);

  await transaction.begin();
  await assertThrowsAsync(
    () => transaction.queryObject`SELECT []`,
    undefined,
    `The transaction "${name}" has been aborted due to \`PostgresError:`,
  );
  assertEquals(client.current_transaction, null);

  await client.release();
});

testPool(async function transactionSavepoints(POOL) {
  const client = await POOL.connect();

  // deno-lint-ignore camelcase
  const savepoint_name = "a1";
  const transaction = client.createTransaction("x");

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

  await client.release();
});

testPool(async function transactionSavepointValidations(POOL) {
  const client = await POOL.connect();

  const transaction = client.createTransaction("x");
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

  await client.release();
});

testPool(async function transactionOperationsThrowIfTransactionNotBegun(POOL) {
  const client = await POOL.connect();

  // deno-lint-ignore camelcase
  const transaction_x = client.createTransaction("x");
  // deno-lint-ignore camelcase
  const transaction_y = client.createTransaction("y");

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

  await client.release();
});
