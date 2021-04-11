import { Client, Pool } from "../mod.ts";
import { assert, assertEquals, assertThrowsAsync } from "./test_deps.ts";
import { getMainConfiguration } from "./config.ts";
import { PoolClient, QueryClient } from "../client.ts";

function generateClient() {
  return new Client(getMainConfiguration());
}

function generatePool() {
  return new Pool(getMainConfiguration(), 10);
}

function testClient(
  name: string,
  t: (getClient: () => Promise<QueryClient>) => void | Promise<void>,
) {
  async function clientWrapper() {
    const clients: Client[] = [];
    try {
      await t(async () => {
        const client = generateClient();
        await client.connect();
        clients.push(client);
        return client;
      });
    } finally {
      for (const client of clients) {
        await client.end();
      }
    }
  }

  async function poolWrapper() {
    const pool = generatePool();
    const clients: PoolClient[] = [];
    try {
      await t(async () => {
        const client = await pool.connect();
        clients.push(client);
        return client;
      });
    } finally {
      for (const client of clients) {
        await client.release();
      }
      await pool.end();
    }
  }

  Deno.test({ fn: clientWrapper, name: `Client: ${name}` });
  Deno.test({ fn: poolWrapper, name: `Pool: ${name}` });
}

testClient("simpleQuery", async function (generateClient) {
  const client = await generateClient();

  const result = await client.queryArray("SELECT UNNEST(ARRAY[1, 2])");
  assertEquals(result.rows.length, 2);
});

testClient("parametrizedQuery", async function (generateClient) {
  const client = await generateClient();

  const result = await client.queryObject(
    "SELECT ID FROM ( SELECT UNNEST(ARRAY[1, 2]) AS ID ) A WHERE ID < $1",
    2,
  );
  assertEquals(result.rows, [{ id: 1 }]);
});

testClient("objectQuery", async function (generateClient) {
  const client = await generateClient();

  const result = await client.queryObject(
    "SELECT ARRAY[1, 2, 3] AS ID, 'DATA' AS TYPE",
  );

  assertEquals(result.rows, [{ id: [1, 2, 3], type: "DATA" }]);
});

testClient("aliasedObjectQuery", async function (generateClient) {
  const client = await generateClient();

  const result = await client.queryObject({
    text: "SELECT ARRAY[1, 2, 3], 'DATA'",
    fields: ["ID", "type"],
  });

  assertEquals(result.rows, [{ id: [1, 2, 3], type: "DATA" }]);
});

testClient(
  "objectQueryThrowsOnRepeatedFields",
  async function (generateClient) {
    const client = await generateClient();

    await assertThrowsAsync(
      async () => {
        await client.queryObject({
          text: "SELECT 1",
          fields: ["FIELD_1", "FIELD_1"],
        });
      },
      TypeError,
      "The fields provided for the query must be unique",
    );
  },
);

testClient(
  "objectQueryThrowsOnNotMatchingFields",
  async function (generateClient) {
    const client = await generateClient();

    await assertThrowsAsync(
      async () => {
        await client.queryObject({
          text: "SELECT 1",
          fields: ["FIELD_1", "FIELD_2"],
        });
      },
      RangeError,
      "The fields provided for the query don't match the ones returned as a result (1 expected, 2 received)",
    );
  },
);

testClient("handleDebugNotice", async function (generateClient) {
  const client = await generateClient();

  // Create temporary function
  await client.queryArray
    `CREATE OR REPLACE FUNCTION PG_TEMP.CREATE_NOTICE () RETURNS INT AS $$ BEGIN RAISE NOTICE 'NOTICED'; RETURN (SELECT 1); END; $$ LANGUAGE PLPGSQL;`;

  const { rows, warnings } = await client.queryArray(
    "SELECT * FROM PG_TEMP.CREATE_NOTICE();",
  );
  assertEquals(rows[0][0], 1);
  assertEquals(warnings[0].message, "NOTICED");
});

// This query doesn't recreate the table and outputs
// a notice instead
testClient("handleQueryNotice", async function (generateClient) {
  const client = await generateClient();

  await client.queryArray(
    "CREATE TEMP TABLE NOTICE_TEST (ABC INT);",
  );
  const { warnings } = await client.queryArray(
    "CREATE TEMP TABLE IF NOT EXISTS NOTICE_TEST (ABC INT);",
  );

  assert(warnings[0].message.includes("already exists"));
});

testClient("nativeType", async function (generateClient) {
  const client = await generateClient();

  const result = await client.queryArray<[Date]>
    `SELECT '2019-02-10T10:30:40.005+04:30'::TIMESTAMPTZ`;
  const row = result.rows[0];

  const expectedDate = Date.UTC(2019, 1, 10, 6, 0, 40, 5);

  assertEquals(row[0].toUTCString(), new Date(expectedDate).toUTCString());
});

testClient("binaryType", async function (generateClient) {
  const client = await generateClient();

  // deno-lint-ignore camelcase
  const { rows: result_1 } = await client.queryArray
    `SELECT E'foo\\\\000\\\\200\\\\\\\\\\\\377'::BYTEA`;

  const expectedBytes = new Uint8Array([102, 111, 111, 0, 128, 92, 255]);

  assertEquals(result_1[0][0], expectedBytes);

  // deno-lint-ignore camelcase
  const { rows: result_2 } = await client.queryArray(
    "SELECT $1::BYTEA",
    expectedBytes,
  );
  assertEquals(result_2[0][0], expectedBytes);
});

testClient("resultMetadata", async function (generateClient) {
  const client = await generateClient();

  await client.queryArray`CREATE TEMP TABLE METADATA (VALUE INTEGER)`;
  await client.queryArray
    `INSERT INTO METADATA VALUES (100), (200), (300), (400), (500), (600)`;

  let result;

  // simple select
  result = await client.queryArray("SELECT * FROM METADATA WHERE VALUE = 100");
  assertEquals(result.command, "SELECT");
  assertEquals(result.rowCount, 1);

  // parameterized select
  result = await client.queryArray(
    "SELECT * FROM METADATA WHERE VALUE IN ($1, $2)",
    200,
    300,
  );
  assertEquals(result.command, "SELECT");
  assertEquals(result.rowCount, 2);

  // simple delete
  result = await client.queryArray(
    "DELETE FROM METADATA WHERE VALUE IN (100, 200)",
  );
  assertEquals(result.command, "DELETE");
  assertEquals(result.rowCount, 2);

  // parameterized delete
  result = await client.queryArray(
    "DELETE FROM METADATA WHERE VALUE = $1",
    300,
  );
  assertEquals(result.command, "DELETE");
  assertEquals(result.rowCount, 1);

  // simple insert
  result = await client.queryArray("INSERT INTO METADATA VALUES (4), (5)");
  assertEquals(result.command, "INSERT");
  assertEquals(result.rowCount, 2);

  // parameterized insert
  result = await client.queryArray("INSERT INTO METADATA VALUES ($1)", 3);
  assertEquals(result.command, "INSERT");
  assertEquals(result.rowCount, 1);

  // simple update
  result = await client.queryArray(
    "UPDATE METADATA SET VALUE = 500 WHERE VALUE IN (500, 600)",
  );
  assertEquals(result.command, "UPDATE");
  assertEquals(result.rowCount, 2);

  // parameterized update
  result = await client.queryArray(
    "UPDATE METADATA SET VALUE = 400 WHERE VALUE = $1",
    400,
  );
  assertEquals(result.command, "UPDATE");
  assertEquals(result.rowCount, 1);
});

testClient("handleNameTooLongError", async function (generateClient) {
  const client = await generateClient();

  const result = await client.queryObject(`
    SELECT 1 AS "very_very_very_very_very_very_very_very_very_very_very_long_name"
  `);
  assertEquals(result.rows, [
    { "very_very_very_very_very_very_very_very_very_very_very_long_nam": 1 },
  ]);
});

testClient("templateStringQueryObject", async function (generateClient) {
  const client = await generateClient();

  const value = { x: "A", y: "B" };

  const { rows } = await client.queryObject<{ x: string; y: string }>
    `SELECT ${value.x} AS X, ${value.y} AS Y`;

  assertEquals(rows[0], value);
});

testClient("templateStringQueryArray", async function (generateClient) {
  const client = await generateClient();

  // deno-lint-ignore camelcase
  const [value_1, value_2] = ["A", "B"];

  const { rows } = await client.queryArray<[string, string]>
    `SELECT ${value_1}, ${value_2}`;

  assertEquals(rows[0], [value_1, value_2]);
});

testClient("transaction", async function (generateClient) {
  const client = await generateClient();

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
});

testClient(
  "transactionIsolationLevelRepeatableRead",
  async function (generateClient) {
    // deno-lint-ignore camelcase
    const client_1 = await generateClient();
    // deno-lint-ignore camelcase
    const client_2 = await generateClient();

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
  },
);

testClient(
  "transactionIsolationLevelSerializable",
  async function (generateClient) {
    // deno-lint-ignore camelcase
    const client_1 = await generateClient();
    // deno-lint-ignore camelcase
    const client_2 = await generateClient();

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
  },
);

testClient("transactionReadOnly", async function (generateClient) {
  const client = await generateClient();

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
});

testClient("transactionSnapshot", async function (generateClient) {
  // deno-lint-ignore camelcase
  const client_1 = await generateClient();
  // deno-lint-ignore camelcase
  const client_2 = await generateClient();

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
});

testClient("transactionLock", async function (generateClient) {
  const client = await generateClient();

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
});

testClient("transactionCommitChain", async function (generateClient) {
  const client = await generateClient();

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
});

testClient(
  "transactionLockIsReleasedOnSavepointLessRollback",
  async function (generateClient) {
    const client = await generateClient();

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
  },
);

testClient("transactionRollbackValidations", async function (generateClient) {
  const client = await generateClient();

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
});

testClient(
  "transactionLockIsReleasedOnUnrecoverableError",
  async function (generateClient) {
    const client = await generateClient();

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
  },
);

testClient("transactionSavepoints", async function (generateClient) {
  const client = await generateClient();

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
});

testClient("transactionSavepointValidations", async function (generateClient) {
  const client = await generateClient();

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
});

testClient(
  "transactionOperationsThrowIfTransactionNotBegun",
  async function (generateClient) {
    const client = await generateClient();

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
  },
);
