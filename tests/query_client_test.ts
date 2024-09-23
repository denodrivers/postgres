import {
  Client,
  ConnectionError,
  Pool,
  PostgresError,
  TransactionError,
} from "../mod.ts";
import {
  assert,
  assertEquals,
  assertInstanceOf,
  assertObjectMatch,
  assertRejects,
  assertThrows,
} from "./test_deps.ts";
import { getMainConfiguration } from "./config.ts";
import type { PoolClient, QueryClient } from "../client.ts";
import type { ClientOptions } from "../connection/connection_params.ts";
import { Oid } from "../query/oid.ts";

function withClient(
  t: (client: QueryClient) => void | Promise<void>,
  config?: ClientOptions,
) {
  async function clientWrapper() {
    const client = new Client(getMainConfiguration(config));
    try {
      await client.connect();
      await t(client);
    } finally {
      await client.end();
    }
  }

  async function poolWrapper() {
    const pool = new Pool(getMainConfiguration(config), 1);
    let client;
    try {
      client = await pool.connect();
      await t(client);
    } finally {
      client?.release();
      await pool.end();
    }
  }

  return async (test: Deno.TestContext) => {
    await test.step({ fn: clientWrapper, name: "Client" });
    await test.step({ fn: poolWrapper, name: "Pool" });
  };
}

function withClientGenerator(
  t: (getClient: () => Promise<QueryClient>) => void | Promise<void>,
  pool_size = 10,
) {
  async function clientWrapper() {
    const clients: Client[] = [];
    try {
      let client_count = 0;
      await t(async () => {
        if (client_count < pool_size) {
          const client = new Client(getMainConfiguration());
          await client.connect();
          clients.push(client);
          client_count++;
          return client;
        } else throw new Error("Max client size exceeded");
      });
    } finally {
      for (const client of clients) {
        await client.end();
      }
    }
  }

  async function poolWrapper() {
    const pool = new Pool(getMainConfiguration(), pool_size);
    const clients: PoolClient[] = [];
    try {
      await t(async () => {
        const client = await pool.connect();
        clients.push(client);
        return client;
      });
    } finally {
      for (const client of clients) {
        client.release();
      }
      await pool.end();
    }
  }

  return async (test: Deno.TestContext) => {
    await test.step({ fn: clientWrapper, name: "Client" });
    await test.step({ fn: poolWrapper, name: "Pool" });
  };
}

Deno.test(
  "Array query",
  withClient(async (client) => {
    const result = await client.queryArray("SELECT UNNEST(ARRAY[1, 2])");
    assertEquals(result.rows.length, 2);
  }),
);

Deno.test(
  "Object query",
  withClient(async (client) => {
    const result = await client.queryObject(
      "SELECT ARRAY[1, 2, 3] AS ID, 'DATA' AS TYPE",
    );

    assertEquals(result.rows, [{ id: [1, 2, 3], type: "DATA" }]);
  }),
);

Deno.test(
  "Decode strategy - auto",
  withClient(
    async (client) => {
      const result = await client.queryObject(
        `SELECT
          'Y'::BOOLEAN AS _bool,
          3.14::REAL AS _float,
          ARRAY[1, 2, 3] AS _int_array, 
          '{"test": "foo", "arr": [1,2,3]}'::JSONB AS _jsonb,
          'DATA' AS _text
        ;`,
      );

      assertEquals(result.rows, [
        {
          _bool: true,
          _float: 3.14,
          _int_array: [1, 2, 3],
          _jsonb: { test: "foo", arr: [1, 2, 3] },
          _text: "DATA",
        },
      ]);
    },
    { controls: { decodeStrategy: "auto" } },
  ),
);

Deno.test(
  "Decode strategy - string",
  withClient(
    async (client) => {
      const result = await client.queryObject(
        `SELECT
          'Y'::BOOLEAN AS _bool,
          3.14::REAL AS _float,
          ARRAY[1, 2, 3] AS _int_array, 
          '{"test": "foo", "arr": [1,2,3]}'::JSONB AS _jsonb,
          'DATA' AS _text
        ;`,
      );

      assertEquals(result.rows, [
        {
          _bool: "t",
          _float: "3.14",
          _int_array: "{1,2,3}",
          _jsonb: '{"arr": [1, 2, 3], "test": "foo"}',
          _text: "DATA",
        },
      ]);
    },
    { controls: { decodeStrategy: "string" } },
  ),
);

Deno.test(
  "Custom decoders",
  withClient(
    async (client) => {
      const result = await client.queryObject(
        `SELECT
          0::BOOLEAN AS _bool,
          (DATE '2024-01-01' + INTERVAL '2 months')::DATE AS _date,
          7.90::REAL AS _float,
          100 AS _int,
          '{"foo": "a", "bar": [1,2,3], "baz": null}'::JSONB AS _jsonb,
          'MY_VALUE' AS _text,
          DATE '2024-10-01' + INTERVAL '2 years' - INTERVAL '2 months' AS _timestamp
        ;`,
      );

      assertEquals(result.rows, [
        {
          _bool: { boolean: false },
          _date: new Date("2024-03-03T00:00:00.000Z"),
          _float: 785,
          _int: 200,
          _jsonb: { id: "999", foo: "A", bar: [2, 4, 6], baz: "initial" },
          _text: ["E", "U", "L", "A", "V", "_", "Y", "M"],
          _timestamp: { year: 2126, month: "---08" },
        },
      ]);
    },
    {
      controls: {
        decoders: {
          // convert to object
          [Oid.bool]: (value: string) => ({ boolean: value === "t" }),
          // 1082 = date : convert to date and add 2 days
          "1082": (value: string) => {
            const d = new Date(value);
            return new Date(d.setDate(d.getDate() + 2));
          },
          // multiply by 100 - 5 = 785
          float4: (value: string) => parseFloat(value) * 100 - 5,
          // convert to int and add 100 = 200
          [Oid.int4]: (value: string) => parseInt(value, 10) + 100,
          // parse with multiple conditions
          jsonb: (value: string) => {
            const obj = JSON.parse(value);
            obj.foo = obj.foo.toUpperCase();
            obj.id = "999";
            obj.bar = obj.bar.map((v: number) => v * 2);
            if (obj.baz === null) obj.baz = "initial";
            return obj;
          },
          // split string and reverse
          [Oid.text]: (value: string) => value.split("").reverse(),
          // 1114 = timestamp : format timestamp into custom object
          1114: (value: string) => {
            const d = new Date(value);
            return {
              year: d.getFullYear() + 100,
              month: `---${d.getMonth() + 1 < 10 ? "0" : ""}${
                d.getMonth() + 1
              }`,
            };
          },
        },
      },
    },
  ),
);

Deno.test(
  "Custom decoders with arrays",
  withClient(
    async (client) => {
      const result = await client.queryObject(
        `SELECT 
        ARRAY[true, false, true] AS _bool_array,
        ARRAY['2024-01-01'::date, '2024-01-02'::date, '2024-01-03'::date] AS _date_array,
        ARRAY[1.5:: REAL, 2.5::REAL, 3.5::REAL] AS _float_array,
        ARRAY[10, 20, 30] AS _int_array,
        ARRAY[
          '{"key1": "value1", "key2": "value2"}'::jsonb,
          '{"key3": "value3", "key4": "value4"}'::jsonb,
          '{"key5": "value5", "key6": "value6"}'::jsonb
        ] AS _jsonb_array,
        ARRAY['string1', 'string2', 'string3'] AS _text_array
        ;`,
      );

      assertEquals(result.rows, [
        {
          _bool_array: [
            { boolean: true },
            { boolean: false },
            { boolean: true },
          ],
          _date_array: [
            new Date("2024-01-11T00:00:00.000Z"),
            new Date("2024-01-12T00:00:00.000Z"),
            new Date("2024-01-13T00:00:00.000Z"),
          ],
          _float_array: [15, 25, 35],
          _int_array: [110, 120, 130],
          _jsonb_array: [
            { key1: "value1", key2: "value2" },
            { key3: "value3", key4: "value4" },
            { key5: "value5", key6: "value6" },
          ],
          _text_array: ["string1_!", "string2_!", "string3_!"],
        },
      ]);
    },
    {
      controls: {
        decoders: {
          // convert to object
          [Oid.bool]: (value: string) => ({ boolean: value === "t" }),
          // 1082 = date : convert to date and add 10 days
          "1082": (value: string) => {
            const d = new Date(value);
            return new Date(d.setDate(d.getDate() + 10));
          },
          // multiply by 20, should not be used!
          float4: (value: string) => parseFloat(value) * 20,
          // multiply by 10
          float4_array: (value: string, _, parseArray) =>
            parseArray(value, (v) => parseFloat(v) * 10),
          // return 0, should not be used!
          [Oid.int4]: () => 0,
          // add 100
          [Oid.int4_array]: (value: string, _, parseArray) =>
            parseArray(value, (v) => parseInt(v, 10) + 100),
          // split string and reverse, should not be used!
          [Oid.text]: (value: string) => value.split("").reverse(),
          // 1009 = text_array : append "_!" to each string
          1009: (value: string, _, parseArray) =>
            parseArray(value, (v) => `${v}_!`),
        },
      },
    },
  ),
);

Deno.test(
  "Custom decoder precedence",
  withClient(
    async (client) => {
      const result = await client.queryObject(
        `SELECT
          0::BOOLEAN AS _bool,
          1 AS _int,
          1::REAL AS _float,
          'TEST' AS _text
        ;`,
      );

      assertEquals(result.rows, [
        {
          _bool: "success",
          _float: "success",
          _int: "success",
          _text: "success",
        },
      ]);
    },
    {
      controls: {
        // numeric oid type values take precedence over name
        decoders: {
          // bool
          bool: () => "fail",
          [16]: () => "success",
          //int
          int4: () => "fail",
          [Oid.int4]: () => "success",
          // float4
          float4: () => "fail",
          "700": () => "success",
          // text
          text: () => "fail",
          25: () => "success",
        },
      },
    },
  ),
);

Deno.test(
  "Debug query not in error",
  withClient(async (client) => {
    const invalid_query = "SELECT this_has $ 'syntax_error';";
    try {
      await client.queryObject(invalid_query);
    } catch (error) {
      assertInstanceOf(error, PostgresError);
      assertEquals(error.message, 'syntax error at or near "$"');
      assertEquals(error.query, undefined);
    }
  }),
);

Deno.test(
  "Debug query in error",
  withClient(
    async (client) => {
      const invalid_query = "SELECT this_has $ 'syntax_error';";
      try {
        await client.queryObject(invalid_query);
      } catch (error) {
        assertInstanceOf(error, PostgresError);
        assertEquals(error.message, 'syntax error at or near "$"');
        assertEquals(error.query, invalid_query);
      }
    },
    {
      controls: {
        debug: {
          queryInError: true,
        },
      },
    },
  ),
);

Deno.test(
  "Array arguments",
  withClient(async (client) => {
    {
      const value = "1";
      const result = await client.queryArray("SELECT $1", [value]);
      assertEquals(result.rows, [[value]]);
    }

    {
      const value = "2";
      const result = await client.queryArray({
        args: [value],
        text: "SELECT $1",
      });
      assertEquals(result.rows, [[value]]);
    }

    {
      const value = "3";
      const result = await client.queryObject("SELECT $1 AS ID", [value]);
      assertEquals(result.rows, [{ id: value }]);
    }

    {
      const value = "4";
      const result = await client.queryObject({
        args: [value],
        text: "SELECT $1 AS ID",
      });
      assertEquals(result.rows, [{ id: value }]);
    }
  }),
);

Deno.test(
  "Object arguments",
  withClient(async (client) => {
    {
      const value = "1";
      const result = await client.queryArray("SELECT $id", { id: value });
      assertEquals(result.rows, [[value]]);
    }

    {
      const value = "2";
      const result = await client.queryArray({
        args: { id: value },
        text: "SELECT $ID",
      });
      assertEquals(result.rows, [[value]]);
    }

    {
      const value = "3";
      const result = await client.queryObject("SELECT $id as ID", {
        id: value,
      });
      assertEquals(result.rows, [{ id: value }]);
    }

    {
      const value = "4";
      const result = await client.queryObject({
        args: { id: value },
        text: "SELECT $ID AS ID",
      });
      assertEquals(result.rows, [{ id: value }]);
    }
  }),
);

Deno.test(
  "Throws on duplicate object arguments",
  withClient(async (client) => {
    const value = "some_value";
    const { rows: res } = await client.queryArray(
      "SELECT $value, $VaLue, $VALUE",
      { value },
    );
    assertEquals(res, [[value, value, value]]);

    await assertRejects(
      () => client.queryArray("SELECT $A", { a: 1, A: 2 }),
      Error,
      "The arguments provided for the query must be unique (insensitive)",
    );
  }),
);

Deno.test(
  "Array query handles recovery after error state",
  withClient(async (client) => {
    await client.queryArray`CREATE TEMP TABLE PREPARED_STATEMENT_ERROR (X INT)`;

    await assertRejects(() =>
      client.queryArray("INSERT INTO PREPARED_STATEMENT_ERROR VALUES ($1)", [
        "TEXT",
      ])
    );

    const { rows } = await client.queryObject<{ result: number }>({
      fields: ["result"],
      text: "SELECT 1",
    });

    assertEquals(rows[0], { result: 1 });
  }),
);

Deno.test(
  "Array query can handle multiple query failures at once",
  withClient(async (client) => {
    await assertRejects(
      () => client.queryArray("SELECT 1; SELECT '2'::INT; SELECT 'A'::INT"),
      PostgresError,
      "invalid input syntax for type integer",
    );

    const { rows } = await client.queryObject<{ result: number }>({
      fields: ["result"],
      text: "SELECT 1",
    });

    assertEquals(rows[0], { result: 1 });
  }),
);

Deno.test(
  "Array query handles error during data processing",
  withClient(async (client) => {
    await assertRejects(() => client.queryObject`SELECT 'A' AS X, 'B' AS X`);

    const value = "193";
    const { rows: result_2 } = await client.queryObject`SELECT ${value} AS B`;
    assertEquals(result_2[0], { b: value });
  }),
);

Deno.test(
  "Array query can return multiple queries",
  withClient(async (client) => {
    const { rows: result } = await client.queryObject<{ result: number }>({
      text: "SELECT 1; SELECT '2'::INT",
      fields: ["result"],
    });

    assertEquals(result, [{ result: 1 }, { result: 2 }]);
  }),
);

Deno.test(
  "Array query handles empty query",
  withClient(async (client) => {
    const { rows: result } = await client.queryArray("");
    assertEquals(result, []);
  }),
);

Deno.test(
  "Prepared query handles recovery after error state",
  withClient(async (client) => {
    await client.queryArray`CREATE TEMP TABLE PREPARED_STATEMENT_ERROR (X INT)`;

    await assertRejects(
      () =>
        client.queryArray("INSERT INTO PREPARED_STATEMENT_ERROR VALUES ($1)", [
          "TEXT",
        ]),
      PostgresError,
    );

    const result = "handled";

    const { rows } = await client.queryObject({
      args: [result],
      fields: ["result"],
      text: "SELECT $1",
    });

    assertEquals(rows[0], { result });
  }),
);

Deno.test(
  "Prepared query handles error during data processing",
  withClient(async (client) => {
    await assertRejects(() => client.queryObject`SELECT ${1} AS A, ${2} AS A`);

    const value = "z";
    const { rows: result_2 } = await client.queryObject`SELECT ${value} AS B`;
    assertEquals(result_2[0], { b: value });
  }),
);

Deno.test(
  "Handles array with semicolon separator",
  withClient(async (client) => {
    const item_1 = "Test;Azer";
    const item_2 = "123;456";

    const { rows: result_1 } = await client.queryArray(`SELECT ARRAY[$1, $2]`, [
      item_1,
      item_2,
    ]);
    assertEquals(result_1[0], [[item_1, item_2]]);
  }),
);

Deno.test(
  "Handles parameter status messages on array query",
  withClient(async (client) => {
    const { rows: result_1 } = await client
      .queryArray`SET TIME ZONE 'HongKong'`;

    assertEquals(result_1, []);

    const { rows: result_2 } = await client.queryObject({
      fields: ["result"],
      text: "SET TIME ZONE 'HongKong'; SELECT 1",
    });

    assertEquals(result_2, [{ result: 1 }]);
  }),
);

Deno.test(
  "Handles parameter status messages on prepared query",
  withClient(async (client) => {
    const result = 10;

    await client
      .queryArray`CREATE OR REPLACE FUNCTION PG_TEMP.CHANGE_TIMEZONE(RES INTEGER) RETURNS INT AS $$
			BEGIN
			SET TIME ZONE 'HongKong';
			END;
			$$ LANGUAGE PLPGSQL;`;

    await assertRejects(
      () =>
        client.queryArray("SELECT * FROM PG_TEMP.CHANGE_TIMEZONE($1)", [
          result,
        ]),
      PostgresError,
      "control reached end of function without RETURN",
    );

    await client
      .queryArray`CREATE OR REPLACE FUNCTION PG_TEMP.CHANGE_TIMEZONE(RES INTEGER) RETURNS INT AS $$
			BEGIN
			SET TIME ZONE 'HongKong';
			RETURN RES;
			END;
			$$ LANGUAGE PLPGSQL;`;

    const { rows: result_1 } = await client.queryObject({
      args: [result],
      fields: ["result"],
      text: "SELECT * FROM PG_TEMP.CHANGE_TIMEZONE($1)",
    });

    assertEquals(result_1, [{ result }]);
  }),
);

Deno.test(
  "Handles parameter status after error",
  withClient(async (client) => {
    await client
      .queryArray`CREATE OR REPLACE FUNCTION PG_TEMP.CHANGE_TIMEZONE() RETURNS INT AS $$
			BEGIN
			SET TIME ZONE 'HongKong';
			END;
			$$ LANGUAGE PLPGSQL;`;

    await assertRejects(
      () => client.queryArray`SELECT * FROM PG_TEMP.CHANGE_TIMEZONE()`,
      PostgresError,
      "control reached end of function without RETURN",
    );
  }),
);

Deno.test(
  "Terminated connections",
  withClient(async (client) => {
    await client.end();

    await assertRejects(
      async () => {
        await client.queryArray`SELECT 1`;
      },
      Error,
      "Connection to the database has been terminated",
    );
  }),
);

// This test depends on the assumption that all clients will default to
// one reconneciton by default
Deno.test(
  "Default reconnection",
  withClient(async (client) => {
    await assertRejects(
      () =>
        client.queryArray`SELECT PG_TERMINATE_BACKEND(${client.session.pid})`,
      ConnectionError,
    );

    const { rows: result } = await client.queryObject<{ res: number }>({
      text: `SELECT 1`,
      fields: ["res"],
    });
    assertEquals(result[0].res, 1);

    assertEquals(client.connected, true);
  }),
);

Deno.test(
  "Handling of debug notices",
  withClient(async (client) => {
    // Create temporary function
    await client
      .queryArray`CREATE OR REPLACE FUNCTION PG_TEMP.CREATE_NOTICE () RETURNS INT AS $$ BEGIN RAISE NOTICE 'NOTICED'; RETURN (SELECT 1); END; $$ LANGUAGE PLPGSQL;`;

    const { rows, warnings } = await client.queryArray(
      "SELECT * FROM PG_TEMP.CREATE_NOTICE();",
    );
    assertEquals(rows[0][0], 1);
    assertEquals(warnings[0].message, "NOTICED");
  }),
);

// This query doesn't recreate the table and outputs
// a notice instead
Deno.test(
  "Handling of query notices",
  withClient(async (client) => {
    await client.queryArray("CREATE TEMP TABLE NOTICE_TEST (ABC INT);");
    const { warnings } = await client.queryArray(
      "CREATE TEMP TABLE IF NOT EXISTS NOTICE_TEST (ABC INT);",
    );

    assert(warnings[0].message.includes("already exists"));
  }),
);

Deno.test(
  "Handling of messages between data fetching",
  withClient(async (client) => {
    await client
      .queryArray`CREATE OR REPLACE FUNCTION PG_TEMP.MESSAGE_BETWEEN_DATA(MESSAGE VARCHAR) RETURNS VARCHAR AS $$
			BEGIN
			RAISE NOTICE '%', MESSAGE;
			RETURN MESSAGE;
			END;
			$$ LANGUAGE PLPGSQL;`;

    const message_1 = "MESSAGE_1";
    const message_2 = "MESSAGE_2";
    const message_3 = "MESSAGE_3";

    const { rows: result, warnings } = await client.queryObject({
      args: [message_1, message_2, message_3],
      fields: ["result"],
      text: `SELECT * FROM PG_TEMP.MESSAGE_BETWEEN_DATA($1)
			UNION ALL
			SELECT * FROM PG_TEMP.MESSAGE_BETWEEN_DATA($2)
			UNION ALL
			SELECT * FROM PG_TEMP.MESSAGE_BETWEEN_DATA($3)`,
    });

    assertEquals(result.length, 3);
    assertEquals(warnings.length, 3);

    assertEquals(result[0], { result: message_1 });
    assertObjectMatch(warnings[0], { message: message_1 });

    assertEquals(result[1], { result: message_2 });
    assertObjectMatch(warnings[1], { message: message_2 });

    assertEquals(result[2], { result: message_3 });
    assertObjectMatch(warnings[2], { message: message_3 });
  }),
);

Deno.test(
  "nativeType",
  withClient(async (client) => {
    const result = await client.queryArray<
      [Date]
    >`SELECT '2019-02-10T10:30:40.005+04:30'::TIMESTAMPTZ`;
    const row = result.rows[0];

    const expectedDate = Date.UTC(2019, 1, 10, 6, 0, 40, 5);

    assertEquals(row[0].toUTCString(), new Date(expectedDate).toUTCString());
  }),
);

Deno.test(
  "Binary data is parsed correctly",
  withClient(async (client) => {
    const { rows: result_1 } = await client
      .queryArray`SELECT E'foo\\\\000\\\\200\\\\\\\\\\\\377'::BYTEA`;

    const expectedBytes = new Uint8Array([102, 111, 111, 0, 128, 92, 255]);

    assertEquals(result_1[0][0], expectedBytes);

    const { rows: result_2 } = await client.queryArray("SELECT $1::BYTEA", [
      expectedBytes,
    ]);
    assertEquals(result_2[0][0], expectedBytes);
  }),
);

Deno.test(
  "Result object metadata",
  withClient(async (client) => {
    await client.queryArray`CREATE TEMP TABLE METADATA (VALUE INTEGER)`;
    await client
      .queryArray`INSERT INTO METADATA VALUES (100), (200), (300), (400), (500), (600)`;

    let result;

    // simple select
    result = await client.queryArray(
      "SELECT * FROM METADATA WHERE VALUE = 100",
    );
    assertEquals(result.command, "SELECT");
    assertEquals(result.rowCount, 1);

    // parameterized select
    result = await client.queryArray(
      "SELECT * FROM METADATA WHERE VALUE IN ($1, $2)",
      [200, 300],
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
    result = await client.queryArray("DELETE FROM METADATA WHERE VALUE = $1", [
      300,
    ]);
    assertEquals(result.command, "DELETE");
    assertEquals(result.rowCount, 1);

    // simple insert
    result = await client.queryArray("INSERT INTO METADATA VALUES (4), (5)");
    assertEquals(result.command, "INSERT");
    assertEquals(result.rowCount, 2);

    // parameterized insert
    result = await client.queryArray("INSERT INTO METADATA VALUES ($1)", [3]);
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
      [400],
    );
    assertEquals(result.command, "UPDATE");
    assertEquals(result.rowCount, 1);
  }),
);

Deno.test(
  "Long column alias is truncated",
  withClient(async (client) => {
    const { rows: result, warnings } = await client.queryObject(`
    SELECT 1 AS "very_very_very_very_very_very_very_very_very_very_very_long_name"
  `);

    assertEquals(result, [
      { very_very_very_very_very_very_very_very_very_very_very_long_nam: 1 },
    ]);

    assert(warnings[0].message.includes("will be truncated"));
  }),
);

Deno.test(
  "Query array with template string",
  withClient(async (client) => {
    const [value_1, value_2] = ["A", "B"];

    const { rows } = await client.queryArray<
      [string, string]
    >`SELECT ${value_1}, ${value_2}`;

    assertEquals(rows[0], [value_1, value_2]);
  }),
);

Deno.test(
  "Object query field names aren't transformed when camel case is disabled",
  withClient(async (client) => {
    const record = {
      pos_x: "100",
      pos_y: "200",
      prefix_name_suffix: "square",
    };

    const { rows: result } = await client.queryObject({
      args: [record.pos_x, record.pos_y, record.prefix_name_suffix],
      camelCase: false,
      text: "SELECT $1 AS POS_X, $2 AS POS_Y, $3 AS PREFIX_NAME_SUFFIX",
    });

    assertEquals(result[0], record);
  }),
);

Deno.test(
  "Object query field names are transformed when camel case is enabled",
  withClient(async (client) => {
    const record = {
      posX: "100",
      posY: "200",
      prefixNameSuffix: "point",
    };

    const { rows: result } = await client.queryObject({
      args: [record.posX, record.posY, record.prefixNameSuffix],
      camelCase: true,
      text: "SELECT $1 AS POS_X, $2 AS POS_Y, $3 AS PREFIX_NAME_SUFFIX",
    });

    assertEquals(result[0], record);
  }),
);

Deno.test(
  "Object query result is mapped to explicit fields",
  withClient(async (client) => {
    const result = await client.queryObject({
      text: "SELECT ARRAY[1, 2, 3], 'DATA'",
      fields: ["ID", "type"],
    });

    assertEquals(result.rows, [{ ID: [1, 2, 3], type: "DATA" }]);
  }),
);

Deno.test(
  "Object query explicit fields override camel case",
  withClient(async (client) => {
    const record = { field_1: "A", field_2: "B", field_3: "C" };

    const { rows: result } = await client.queryObject({
      args: [record.field_1, record.field_2, record.field_3],
      camelCase: true,
      fields: ["field_1", "field_2", "field_3"],
      text: "SELECT $1 AS POS_X, $2 AS POS_Y, $3 AS PREFIX_NAME_SUFFIX",
    });

    assertEquals(result[0], record);
  }),
);

Deno.test(
  "Object query throws if explicit fields aren't unique",
  withClient(async (client) => {
    await assertRejects(
      () =>
        client.queryObject({
          text: "SELECT 1",
          fields: ["FIELD_1", "FIELD_1"],
        }),
      TypeError,
      "The fields provided for the query must be unique",
    );
  }),
);

Deno.test(
  "Object query throws if implicit fields aren't unique 1",
  withClient(async (client) => {
    await assertRejects(
      () => client.queryObject`SELECT 1 AS "a", 2 AS A`,
      Error,
      `Field names "a" are duplicated in the result of the query`,
    );

    await assertRejects(
      () =>
        client.queryObject({
          camelCase: true,
          text: `SELECT 1 AS "fieldX", 2 AS field_x`,
        }),
      Error,
      `Field names "fieldX" are duplicated in the result of the query`,
    );
  }),
);

Deno.test(
  "Object query doesn't throw when explicit fields only have one letter",
  withClient(async (client) => {
    const { rows: result_1 } = await client.queryObject<{ a: number }>({
      text: "SELECT 1",
      fields: ["a"],
    });

    assertEquals(result_1[0].a, 1);

    await assertRejects(
      async () => {
        await client.queryObject({
          text: "SELECT 1",
          fields: ["1"],
        });
      },
      TypeError,
      "The fields provided for the query must contain only letters and underscores",
    );
  }),
);

Deno.test(
  "Object query throws if explicit fields aren't valid",
  withClient(async (client) => {
    await assertRejects(
      async () => {
        await client.queryObject({
          text: "SELECT 1",
          fields: ["123_"],
        });
      },
      TypeError,
      "The fields provided for the query must contain only letters and underscores",
    );

    await assertRejects(
      async () => {
        await client.queryObject({
          text: "SELECT 1",
          fields: ["1A"],
        });
      },
      TypeError,
      "The fields provided for the query must contain only letters and underscores",
    );

    await assertRejects(
      async () => {
        await client.queryObject({
          text: "SELECT 1",
          fields: ["A$"],
        });
      },
      TypeError,
      "The fields provided for the query must contain only letters and underscores",
    );
  }),
);

Deno.test(
  "Object query throws if result columns don't match explicit fields",
  withClient(async (client) => {
    await assertRejects(
      async () => {
        await client.queryObject({
          text: "SELECT 1",
          fields: ["FIELD_1", "FIELD_2"],
        });
      },
      RangeError,
      "The fields provided for the query don't match the ones returned as a result (1 expected, 2 received)",
    );
  }),
);

Deno.test(
  "Object query throws when multiple query results don't have the same number of rows",
  withClient(async function (client) {
    await assertRejects(
      () =>
        client.queryObject<{ result: number }>({
          text: "SELECT 1; SELECT '2'::INT, '3'",
          fields: ["result"],
        }),
      RangeError,
      "The result fields returned by the database don't match the defined structure of the result",
    );
  }),
);

Deno.test(
  "Query object with template string",
  withClient(async (client) => {
    const value = { x: "A", y: "B" };

    const { rows } = await client.queryObject<{
      x: string;
      y: string;
    }>`SELECT ${value.x} AS x, ${value.y} AS y`;

    assertEquals(rows[0], value);
  }),
);

Deno.test(
  "Transaction parameter validation",
  withClient((client) => {
    assertThrows(
      // deno-lint-ignore ban-ts-comment
      // @ts-expect-error
      () => client.createTransaction(),
      "Transaction name must be a non-empty string",
    );
  }),
);

Deno.test(
  "Transaction",
  withClient(async (client) => {
    const transaction_name = "x";
    const transaction = client.createTransaction(transaction_name);

    await transaction.begin();
    assertEquals(
      client.session.current_transaction,
      transaction_name,
      "Client is locked out during transaction",
    );
    await transaction.queryArray`CREATE TEMP TABLE TEST (X INTEGER)`;
    const savepoint = await transaction.savepoint("table_creation");
    await transaction.queryArray`INSERT INTO TEST (X) VALUES (1)`;
    const query_1 = await transaction.queryObject<{
      x: number;
    }>`SELECT X FROM TEST`;
    assertEquals(
      query_1.rows[0].x,
      1,
      "Operation was not executed inside transaction",
    );
    await transaction.rollback(savepoint);
    const query_2 = await transaction.queryObject<{
      x: number;
    }>`SELECT X FROM TEST`;
    assertEquals(
      query_2.rowCount,
      0,
      "Rollback was not succesful inside transaction",
    );
    await transaction.commit();
    assertEquals(
      client.session.current_transaction,
      null,
      "Client was not released after transaction",
    );
  }),
);

Deno.test(
  "Transaction implement queryArray and queryObject correctly",
  withClient(async (client) => {
    const transaction = client.createTransaction("test");

    await transaction.begin();

    const data = 1;
    {
      const { rows: result } = await transaction
        .queryArray`SELECT ${data}::INTEGER`;
      assertEquals(result[0], [data]);
    }
    {
      const { rows: result } = await transaction.queryObject({
        text: "SELECT $1::INTEGER",
        args: [data],
        fields: ["data"],
      });
      assertEquals(result[0], { data });
    }

    await transaction.commit();
  }),
);

Deno.test(
  "Transaction with repeatable read isolation level",
  withClientGenerator(async (generateClient) => {
    const client_1 = await generateClient();

    const client_2 = await generateClient();

    await client_1.queryArray`DROP TABLE IF EXISTS FOR_TRANSACTION_TEST`;
    await client_1.queryArray`CREATE TABLE FOR_TRANSACTION_TEST (X INTEGER)`;
    await client_1.queryArray`INSERT INTO FOR_TRANSACTION_TEST (X) VALUES (1)`;

    const transaction_rr = client_1.createTransaction(
      "transactionIsolationLevelRepeatableRead",
      { isolation_level: "repeatable_read" },
    );
    await transaction_rr.begin();

    // This locks the current value of the test table
    await transaction_rr.queryObject<{
      x: number;
    }>`SELECT X FROM FOR_TRANSACTION_TEST`;

    // Modify data outside the transaction
    await client_2.queryArray`UPDATE FOR_TRANSACTION_TEST SET X = 2`;

    const { rows: query_1 } = await client_2.queryObject<{
      x: number;
    }>`SELECT X FROM FOR_TRANSACTION_TEST`;
    assertEquals(query_1, [{ x: 2 }]);

    const { rows: query_2 } = await transaction_rr.queryObject<{
      x: number;
    }>`SELECT X FROM FOR_TRANSACTION_TEST`;
    assertEquals(
      query_2,
      [{ x: 1 }],
      "Repeatable read transaction should not be able to observe changes that happened after the transaction start",
    );

    await transaction_rr.commit();

    const { rows: query_3 } = await client_1.queryObject<{
      x: number;
    }>`SELECT X FROM FOR_TRANSACTION_TEST`;
    assertEquals(
      query_3,
      [{ x: 2 }],
      "Main session should be able to observe changes after transaction ended",
    );

    await client_1.queryArray`DROP TABLE FOR_TRANSACTION_TEST`;
  }),
);

Deno.test(
  "Transaction with serializable isolation level",
  withClientGenerator(async (generateClient) => {
    const client_1 = await generateClient();

    const client_2 = await generateClient();

    await client_1.queryArray`DROP TABLE IF EXISTS FOR_TRANSACTION_TEST`;
    await client_1.queryArray`CREATE TABLE FOR_TRANSACTION_TEST (X INTEGER)`;
    await client_1.queryArray`INSERT INTO FOR_TRANSACTION_TEST (X) VALUES (1)`;

    const transaction_rr = client_1.createTransaction(
      "transactionIsolationLevelRepeatableRead",
      { isolation_level: "serializable" },
    );
    await transaction_rr.begin();

    // This locks the current value of the test table
    await transaction_rr.queryObject<{
      x: number;
    }>`SELECT X FROM FOR_TRANSACTION_TEST`;

    // Modify data outside the transaction
    await client_2.queryArray`UPDATE FOR_TRANSACTION_TEST SET X = 2`;

    await assertRejects(
      () => transaction_rr.queryArray`UPDATE FOR_TRANSACTION_TEST SET X = 3`,
      TransactionError,
      undefined,
      "A serializable transaction should throw if the data read in the transaction has been modified externally",
    );

    const { rows: query_3 } = await client_1.queryObject<{
      x: number;
    }>`SELECT X FROM FOR_TRANSACTION_TEST`;
    assertEquals(
      query_3,
      [{ x: 2 }],
      "Main session should be able to observe changes after transaction ended",
    );

    await client_1.queryArray`DROP TABLE FOR_TRANSACTION_TEST`;
  }),
);

Deno.test(
  "Transaction read only",
  withClient(async (client) => {
    await client.queryArray`DROP TABLE IF EXISTS FOR_TRANSACTION_TEST`;
    await client.queryArray`CREATE TABLE FOR_TRANSACTION_TEST (X INTEGER)`;
    const transaction = client.createTransaction("transactionReadOnly", {
      read_only: true,
    });
    await transaction.begin();

    await assertRejects(
      () => transaction.queryArray`DELETE FROM FOR_TRANSACTION_TEST`,
      TransactionError,
      undefined,
      "DELETE shouldn't be able to be used in a read-only transaction",
    );

    await client.queryArray`DROP TABLE FOR_TRANSACTION_TEST`;
  }),
);

Deno.test(
  "Transaction snapshot",
  withClientGenerator(async (generateClient) => {
    const client_1 = await generateClient();
    const client_2 = await generateClient();

    await client_1.queryArray`DROP TABLE IF EXISTS FOR_TRANSACTION_TEST`;
    await client_1.queryArray`CREATE TABLE FOR_TRANSACTION_TEST (X INTEGER)`;
    await client_1.queryArray`INSERT INTO FOR_TRANSACTION_TEST (X) VALUES (1)`;
    const transaction_1 = client_1.createTransaction("transactionSnapshot1", {
      isolation_level: "repeatable_read",
    });
    await transaction_1.begin();

    // This locks the current value of the test table
    await transaction_1.queryObject<{
      x: number;
    }>`SELECT X FROM FOR_TRANSACTION_TEST`;

    // Modify data outside the transaction
    await client_2.queryArray`UPDATE FOR_TRANSACTION_TEST SET X = 2`;

    const { rows: query_1 } = await transaction_1.queryObject<{
      x: number;
    }>`SELECT X FROM FOR_TRANSACTION_TEST`;
    assertEquals(
      query_1,
      [{ x: 1 }],
      "External changes shouldn't affect repeatable read transaction",
    );

    const snapshot = await transaction_1.getSnapshot();

    const transaction_2 = client_2.createTransaction("transactionSnapshot2", {
      isolation_level: "repeatable_read",
      snapshot,
    });
    await transaction_2.begin();

    const { rows: query_2 } = await transaction_2.queryObject<{
      x: number;
    }>`SELECT X FROM FOR_TRANSACTION_TEST`;
    assertEquals(
      query_2,
      [{ x: 1 }],
      "External changes shouldn't affect repeatable read transaction with previous snapshot",
    );

    await transaction_1.commit();
    await transaction_2.commit();

    await client_1.queryArray`DROP TABLE FOR_TRANSACTION_TEST`;
  }),
);

Deno.test(
  "Transaction locks client",
  withClient(async (client) => {
    const name = "x";
    const transaction = client.createTransaction(name);

    await transaction.begin();
    await transaction.queryArray`SELECT 1`;
    await assertRejects(
      () => client.queryArray`SELECT 1`,
      Error,
      `This connection is currently locked by the "${name}" transaction`,
      "The connection is not being locked by the transaction",
    );
    await transaction.commit();

    await client.queryArray`SELECT 1`;
    assertEquals(
      client.session.current_transaction,
      null,
      "Client was not released after transaction",
    );
  }),
);

Deno.test(
  "Transaction commit chain",
  withClient(async (client) => {
    const name = "transactionCommitChain";
    const transaction = client.createTransaction(name);

    await transaction.begin();

    await transaction.commit({ chain: true });
    assertEquals(
      client.session.current_transaction,
      name,
      "Client shouldn't have been released on chained commit",
    );

    await transaction.commit();
    assertEquals(
      client.session.current_transaction,
      null,
      "Client was not released after transaction ended",
    );
  }),
);

Deno.test(
  "Transaction lock is released on savepoint-less rollback",
  withClient(async (client) => {
    const name = "transactionLockIsReleasedOnRollback";
    const transaction = client.createTransaction(name);

    await client.queryArray`CREATE TEMP TABLE MY_TEST (X INTEGER)`;
    await transaction.begin();
    await transaction.queryArray`INSERT INTO MY_TEST (X) VALUES (1)`;

    const { rows: query_1 } = await transaction.queryObject<{
      x: number;
    }>`SELECT X FROM MY_TEST`;
    assertEquals(query_1, [{ x: 1 }]);

    await transaction.rollback({ chain: true });

    assertEquals(
      client.session.current_transaction,
      name,
      "Client shouldn't have been released after chained rollback",
    );

    await transaction.rollback();

    const { rowCount: query_2 } = await client.queryObject<{
      x: number;
    }>`SELECT X FROM MY_TEST`;
    assertEquals(query_2, 0);

    assertEquals(
      client.session.current_transaction,
      null,
      "Client was not released after rollback",
    );
  }),
);

Deno.test(
  "Transaction rollback validations",
  withClient(async (client) => {
    const transaction = client.createTransaction(
      "transactionRollbackValidations",
    );
    await transaction.begin();

    await assertRejects(
      // @ts-ignore This is made to check the two properties aren't passed at once
      () => transaction.rollback({ savepoint: "unexistent", chain: true }),
      Error,
      "The chain option can't be used alongside a savepoint on a rollback operation",
    );

    await transaction.commit();
  }),
);

Deno.test(
  "Transaction lock is released after unrecoverable error",
  withClient(async (client) => {
    const name = "transactionLockIsReleasedOnUnrecoverableError";
    const transaction = client.createTransaction(name);

    await transaction.begin();
    await assertRejects(
      () => transaction.queryArray`SELECT []`,
      TransactionError,
      `The transaction "${name}" has been aborted`,
    );
    assertEquals(client.session.current_transaction, null);

    await transaction.begin();
    await assertRejects(
      () => transaction.queryObject`SELECT []`,
      TransactionError,
      `The transaction "${name}" has been aborted`,
    );
    assertEquals(client.session.current_transaction, null);
  }),
);

Deno.test(
  "Transaction savepoints",
  withClient(async (client) => {
    const savepoint_name = "a1";
    const transaction = client.createTransaction("x");

    await transaction.begin();
    await transaction.queryArray`CREATE TEMP TABLE X (Y INT)`;
    await transaction.queryArray`INSERT INTO X VALUES (1)`;
    const { rows: query_1 } = await transaction.queryObject<{
      y: number;
    }>`SELECT Y FROM X`;
    assertEquals(query_1, [{ y: 1 }]);

    const savepoint = await transaction.savepoint(savepoint_name);

    await transaction.queryArray`DELETE FROM X`;
    const { rowCount: query_2 } = await transaction.queryObject<{
      y: number;
    }>`SELECT Y FROM X`;
    assertEquals(query_2, 0);

    await savepoint.update();

    await transaction.queryArray`INSERT INTO X VALUES (2)`;
    const { rows: query_3 } = await transaction.queryObject<{
      y: number;
    }>`SELECT Y FROM X`;
    assertEquals(query_3, [{ y: 2 }]);

    await transaction.rollback(savepoint);
    const { rowCount: query_4 } = await transaction.queryObject<{
      y: number;
    }>`SELECT Y FROM X`;
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
    const { rows: query_5 } = await transaction.queryObject<{
      y: number;
    }>`SELECT Y FROM X`;
    assertEquals(query_5, [{ y: 1 }]);

    await transaction.commit();
  }),
);

Deno.test(
  "Transaction savepoint validations",
  withClient(async (client) => {
    const transaction = client.createTransaction("x");
    await transaction.begin();

    await assertRejects(
      () => transaction.savepoint("1"),
      Error,
      "The savepoint name can't begin with a number",
    );

    await assertRejects(
      () =>
        transaction.savepoint(
          "this_savepoint_is_going_to_be_longer_than_sixty_three_characters",
        ),
      Error,
      "The savepoint name can't be longer than 63 characters",
    );

    await assertRejects(
      () => transaction.savepoint("+"),
      Error,
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

    await assertRejects(
      () => savepoint.release(),
      Error,
      "This savepoint has no instances to release",
    );

    await assertRejects(
      () => transaction.rollback(savepoint),
      Error,
      `There are no savepoints of "abc1" left to rollback to`,
    );

    await assertRejects(
      () => transaction.rollback("UNEXISTENT"),
      Error,
      `There is no "unexistent" savepoint registered in this transaction`,
    );

    await transaction.commit();
  }),
);

Deno.test(
  "Transaction operations throw if transaction has not been initialized",
  withClient(async (client) => {
    const transaction_x = client.createTransaction("x");

    const transaction_y = client.createTransaction("y");

    await transaction_x.begin();

    await assertRejects(
      () => transaction_y.begin(),
      Error,
      `This client already has an ongoing transaction "x"`,
    );

    await transaction_x.commit();
    await transaction_y.begin();
    await assertRejects(
      () => transaction_y.begin(),
      Error,
      "This transaction is already open",
    );

    await transaction_y.commit();
    await assertRejects(
      () => transaction_y.commit(),
      Error,
      `This transaction has not been started yet, make sure to use the "begin" method to do so`,
    );

    await assertRejects(
      () => transaction_y.commit(),
      Error,
      `This transaction has not been started yet, make sure to use the "begin" method to do so`,
    );

    await assertRejects(
      () => transaction_y.queryArray`SELECT 1`,
      Error,
      `This transaction has not been started yet, make sure to use the "begin" method to do so`,
    );

    await assertRejects(
      () => transaction_y.queryObject`SELECT 1`,
      Error,
      `This transaction has not been started yet, make sure to use the "begin" method to do so`,
    );

    await assertRejects(
      () => transaction_y.rollback(),
      Error,
      `This transaction has not been started yet, make sure to use the "begin" method to do so`,
    );

    await assertRejects(
      () => transaction_y.savepoint("SOME"),
      Error,
      `This transaction has not been started yet, make sure to use the "begin" method to do so`,
    );
  }),
);
