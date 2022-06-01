import { assertEquals, base64, date } from "./test_deps.ts";
import { getMainConfiguration } from "./config.ts";
import { generateSimpleClientTest } from "./helpers.ts";
import type {
  Box,
  Circle,
  Float4,
  Float8,
  Line,
  LineSegment,
  Path,
  Point,
  Polygon,
  TID,
  Timestamp,
} from "../query/types.ts";

// TODO
// Find out how to test char types

/**
 * This will generate a random number with a precision of 2
 */
function generateRandomNumber(max_value: number) {
  return Math.round((Math.random() * max_value + Number.EPSILON) * 100) / 100;
}

function generateRandomPoint(max_value = 100): Point {
  return {
    x: String(generateRandomNumber(max_value)) as Float8,
    y: String(generateRandomNumber(max_value)) as Float8,
  };
}

const CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
function randomBase64(): string {
  return base64.encode(
    Array.from(
      { length: Math.ceil(Math.random() * 256) },
      () => CHARS[Math.floor(Math.random() * CHARS.length)],
    ).join(""),
  );
}

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const timezone_utc = new Date().toTimeString().slice(12, 17);

const testClient = generateSimpleClientTest(getMainConfiguration());

Deno.test(
  "inet",
  testClient(async (client) => {
    const url = "127.0.0.1";
    const selectRes = await client.queryArray(
      "SELECT $1::INET",
      [url],
    );
    assertEquals(selectRes.rows[0], [url]);
  }),
);

Deno.test(
  "inet array",
  testClient(async (client) => {
    const { rows: result_1 } = await client.queryArray(
      "SELECT '{ 127.0.0.1, 192.168.178.0/24 }'::inet[]",
    );
    assertEquals(result_1[0], [["127.0.0.1", "192.168.178.0/24"]]);

    const { rows: result_2 } = await client.queryArray(
      "SELECT '{{127.0.0.1},{192.168.178.0/24}}'::inet[]",
    );
    assertEquals(result_2[0], [[["127.0.0.1"], ["192.168.178.0/24"]]]);
  }),
);

Deno.test(
  "macaddr",
  testClient(async (client) => {
    const address = "08:00:2b:01:02:03";

    const { rows } = await client.queryArray(
      "SELECT $1::MACADDR",
      [address],
    );
    assertEquals(rows[0], [address]);
  }),
);

Deno.test(
  "macaddr array",
  testClient(async (client) => {
    const { rows: result_1 } = await client.queryArray(
      "SELECT '{ 08:00:2b:01:02:03, 09:00:2b:01:02:04 }'::macaddr[]",
    );
    assertEquals(result_1[0], [[
      "08:00:2b:01:02:03",
      "09:00:2b:01:02:04",
    ]]);

    const { rows: result_2 } = await client.queryArray(
      "SELECT '{{08:00:2b:01:02:03},{09:00:2b:01:02:04}}'::macaddr[]",
    );
    assertEquals(
      result_2[0],
      [[["08:00:2b:01:02:03"], ["09:00:2b:01:02:04"]]],
    );
  }),
);

Deno.test(
  "cidr",
  testClient(async (client) => {
    const host = "192.168.100.128/25";

    const { rows } = await client.queryArray(
      "SELECT $1::CIDR",
      [host],
    );
    assertEquals(rows[0], [host]);
  }),
);

Deno.test(
  "cidr array",
  testClient(async (client) => {
    const { rows: result_1 } = await client.queryArray(
      "SELECT '{ 10.1.0.0/16, 11.11.11.0/24 }'::cidr[]",
    );
    assertEquals(result_1[0], [["10.1.0.0/16", "11.11.11.0/24"]]);

    const { rows: result_2 } = await client.queryArray(
      "SELECT '{{10.1.0.0/16},{11.11.11.0/24}}'::cidr[]",
    );
    assertEquals(result_2[0], [[["10.1.0.0/16"], ["11.11.11.0/24"]]]);
  }),
);

Deno.test(
  "name",
  testClient(async (client) => {
    const name = "some";
    const result = await client.queryArray(`SELECT $1::name`, [name]);
    assertEquals(result.rows[0], [name]);
  }),
);

Deno.test(
  "name array",
  testClient(async (client) => {
    const result = await client.queryArray(
      `SELECT ARRAY['some'::name, 'none']`,
    );
    assertEquals(result.rows[0], [["some", "none"]]);
  }),
);

Deno.test(
  "oid",
  testClient(async (client) => {
    const result = await client.queryArray(`SELECT 1::oid`);
    assertEquals(result.rows[0][0], "1");
  }),
);

Deno.test(
  "oid array",
  testClient(async (client) => {
    const result = await client.queryArray(`SELECT ARRAY[1::oid, 452, 1023]`);
    assertEquals(result.rows[0][0], ["1", "452", "1023"]);
  }),
);

Deno.test(
  "regproc",
  testClient(async (client) => {
    const result = await client.queryArray(`SELECT 'now'::regproc`);
    assertEquals(result.rows[0][0], "now");
  }),
);

Deno.test(
  "regproc array",
  testClient(async (client) => {
    const result = await client.queryArray(
      `SELECT ARRAY['now'::regproc, 'timeofday']`,
    );
    assertEquals(result.rows[0][0], ["now", "timeofday"]);
  }),
);

Deno.test(
  "regprocedure",
  testClient(async (client) => {
    const result = await client.queryArray(
      `SELECT 'sum(integer)'::regprocedure`,
    );
    assertEquals(result.rows[0][0], "sum(integer)");
  }),
);

Deno.test(
  "regprocedure array",
  testClient(async (client) => {
    const result = await client.queryArray(
      `SELECT ARRAY['sum(integer)'::regprocedure, 'max(integer)']`,
    );
    assertEquals(result.rows[0][0], ["sum(integer)", "max(integer)"]);
  }),
);

Deno.test(
  "regoper",
  testClient(async (client) => {
    const operator = "!!";

    const { rows } = await client.queryObject({
      args: [operator],
      fields: ["result"],
      text: "SELECT $1::regoper",
    });

    assertEquals(rows[0], { result: operator });
  }),
);

Deno.test(
  "regoper array",
  testClient(async (client) => {
    const operator_1 = "!!";
    const operator_2 = "|/";

    const { rows } = await client.queryObject({
      args: [operator_1, operator_2],
      fields: ["result"],
      text: "SELECT ARRAY[$1::regoper, $2]",
    });

    assertEquals(rows[0], { result: [operator_1, operator_2] });
  }),
);

Deno.test(
  "regoperator",
  testClient(async (client) => {
    const regoperator = "-(NONE,integer)";

    const { rows } = await client.queryObject({
      args: [regoperator],
      fields: ["result"],
      text: "SELECT $1::regoperator",
    });

    assertEquals(rows[0], { result: regoperator });
  }),
);

Deno.test(
  "regoperator array",
  testClient(async (client) => {
    const regoperator_1 = "-(NONE,integer)";
    const regoperator_2 = "*(integer,integer)";

    const { rows } = await client.queryObject({
      args: [regoperator_1, regoperator_2],
      fields: ["result"],
      text: "SELECT ARRAY[$1::regoperator, $2]",
    });

    assertEquals(rows[0], { result: [regoperator_1, regoperator_2] });
  }),
);

Deno.test(
  "regclass",
  testClient(async (client) => {
    const object_name = "TEST_REGCLASS";

    await client.queryArray(`CREATE TEMP TABLE ${object_name} (X INT)`);

    const result = await client.queryObject<{ table_name: string }>({
      args: [object_name],
      fields: ["table_name"],
      text: "SELECT $1::REGCLASS",
    });

    assertEquals(result.rows.length, 1);
    // Objects in postgres are case insensitive unless indicated otherwise
    assertEquals(
      result.rows[0].table_name.toLowerCase(),
      object_name.toLowerCase(),
    );
  }),
);

Deno.test(
  "regclass array",
  testClient(async (client) => {
    const object_1 = "TEST_REGCLASS_1";
    const object_2 = "TEST_REGCLASS_2";

    await client.queryArray(`CREATE TEMP TABLE ${object_1} (X INT)`);
    await client.queryArray(`CREATE TEMP TABLE ${object_2} (X INT)`);

    const { rows: result } = await client.queryObject<
      { tables: [string, string] }
    >({
      args: [object_1, object_2],
      fields: ["tables"],
      text: "SELECT ARRAY[$1::REGCLASS, $2]",
    });

    assertEquals(result.length, 1);
    assertEquals(result[0].tables.length, 2);
    // Objects in postgres are case insensitive unless indicated otherwise
    assertEquals(
      result[0].tables.map((x) => x.toLowerCase()),
      [object_1, object_2].map((x) => x.toLowerCase()),
    );
  }),
);

Deno.test(
  "regtype",
  testClient(async (client) => {
    const result = await client.queryArray(`SELECT 'integer'::regtype`);
    assertEquals(result.rows[0][0], "integer");
  }),
);

Deno.test(
  "regtype array",
  testClient(async (client) => {
    const result = await client.queryArray(
      `SELECT ARRAY['integer'::regtype, 'bigint']`,
    );
    assertEquals(result.rows[0][0], ["integer", "bigint"]);
  }),
);

// TODO
// Refactor test to look for users directly in the database instead
// of relying on config
Deno.test(
  "regrole",
  testClient(async (client) => {
    const user = getMainConfiguration().user;

    const result = await client.queryArray(
      `SELECT ($1)::regrole`,
      [user],
    );

    assertEquals(result.rows[0][0], user);
  }),
);

Deno.test(
  "regrole array",
  testClient(async (client) => {
    const user = getMainConfiguration().user;

    const result = await client.queryArray(
      `SELECT ARRAY[($1)::regrole]`,
      [user],
    );

    assertEquals(result.rows[0][0], [user]);
  }),
);

Deno.test(
  "regnamespace",
  testClient(async (client) => {
    const result = await client.queryArray(`SELECT 'public'::regnamespace;`);
    assertEquals(result.rows[0][0], "public");
  }),
);

Deno.test(
  "regnamespace array",
  testClient(async (client) => {
    const result = await client.queryArray(
      `SELECT ARRAY['public'::regnamespace, 'pg_catalog'];`,
    );
    assertEquals(result.rows[0][0], ["public", "pg_catalog"]);
  }),
);

Deno.test(
  "regconfig",
  testClient(async (client) => {
    const result = await client.queryArray(`SElECT 'english'::regconfig`);
    assertEquals(result.rows, [["english"]]);
  }),
);

Deno.test(
  "regconfig array",
  testClient(async (client) => {
    const result = await client.queryArray(
      `SElECT ARRAY['english'::regconfig, 'spanish']`,
    );
    assertEquals(result.rows[0][0], ["english", "spanish"]);
  }),
);

Deno.test(
  "regdictionary",
  testClient(async (client) => {
    const result = await client.queryArray("SELECT 'simple'::regdictionary");
    assertEquals(result.rows[0][0], "simple");
  }),
);

Deno.test(
  "regdictionary array",
  testClient(async (client) => {
    const result = await client.queryArray(
      "SELECT ARRAY['simple'::regdictionary]",
    );
    assertEquals(result.rows[0][0], ["simple"]);
  }),
);

Deno.test(
  "bigint",
  testClient(async (client) => {
    const result = await client.queryArray("SELECT 9223372036854775807");
    assertEquals(result.rows[0][0], 9223372036854775807n);
  }),
);

Deno.test(
  "bigint array",
  testClient(async (client) => {
    const result = await client.queryArray(
      "SELECT ARRAY[9223372036854775807, 789141]",
    );
    assertEquals(result.rows[0][0], [9223372036854775807n, 789141n]);
  }),
);

Deno.test(
  "numeric",
  testClient(async (client) => {
    const number = "1234567890.1234567890";
    const result = await client.queryArray(`SELECT $1::numeric`, [number]);
    assertEquals(result.rows[0][0], number);
  }),
);

Deno.test(
  "numeric array",
  testClient(async (client) => {
    const numeric = ["1234567890.1234567890", "6107693.123123124"];
    const result = await client.queryArray(
      `SELECT ARRAY[$1::numeric, $2]`,
      [numeric[0], numeric[1]],
    );
    assertEquals(result.rows[0][0], numeric);
  }),
);

Deno.test(
  "integer",
  testClient(async (client) => {
    const int = 17;

    const { rows: result } = await client.queryObject({
      args: [int],
      fields: ["result"],
      text: "SELECT $1::INTEGER",
    });

    assertEquals(result[0], { result: int });
  }),
);

Deno.test(
  "integer array",
  testClient(async (client) => {
    const { rows: result_1 } = await client.queryArray(
      "SELECT '{1,100}'::int[]",
    );
    assertEquals(result_1[0], [[1, 100]]);

    const { rows: result_2 } = await client.queryArray(
      "SELECT '{{1},{100}}'::int[]",
    );
    assertEquals(result_2[0], [[[1], [100]]]);
  }),
);

Deno.test(
  "char",
  testClient(async (client) => {
    await client.queryArray(
      `CREATE TEMP TABLE CHAR_TEST (X CHARACTER(2));`,
    );
    await client.queryArray(
      `INSERT INTO CHAR_TEST (X) VALUES ('A');`,
    );
    const result = await client.queryArray(
      `SELECT X FROM CHAR_TEST`,
    );
    assertEquals(result.rows[0][0], "A ");
  }),
);

Deno.test(
  "char array",
  testClient(async (client) => {
    const result = await client.queryArray(
      `SELECT '{"x","Y"}'::char[]`,
    );
    assertEquals(result.rows[0][0], ["x", "Y"]);
  }),
);

Deno.test(
  "text",
  testClient(async (client) => {
    const result = await client.queryArray(
      `SELECT 'ABCD'::text`,
    );
    assertEquals(result.rows[0], ["ABCD"]);
  }),
);

Deno.test(
  "text array",
  testClient(async (client) => {
    const { rows: result_1 } = await client.queryArray(
      `SELECT '{"(ZYX)-123-456","(ABC)-987-654"}'::text[]`,
    );
    assertEquals(result_1[0], [["(ZYX)-123-456", "(ABC)-987-654"]]);

    const { rows: result_2 } = await client.queryArray(
      `SELECT '{{"(ZYX)-123-456"},{"(ABC)-987-654"}}'::text[]`,
    );
    assertEquals(result_2[0], [[["(ZYX)-123-456"], ["(ABC)-987-654"]]]);
  }),
);

Deno.test(
  "varchar",
  testClient(async (client) => {
    const result = await client.queryArray(
      `SELECT 'ABC'::varchar`,
    );
    assertEquals(result.rows[0][0], "ABC");
  }),
);

Deno.test(
  "varchar array",
  testClient(async (client) => {
    const { rows: result_1 } = await client.queryArray(
      `SELECT '{"(ZYX)-(PQR)-456","(ABC)-987-(?=+)"}'::varchar[]`,
    );
    assertEquals(result_1[0], [["(ZYX)-(PQR)-456", "(ABC)-987-(?=+)"]]);

    const { rows: result_2 } = await client.queryArray(
      `SELECT '{{"(ZYX)-(PQR)-456"},{"(ABC)-987-(?=+)"}}'::varchar[]`,
    );
    assertEquals(result_2[0], [[["(ZYX)-(PQR)-456"], ["(ABC)-987-(?=+)"]]]);
  }),
);

Deno.test(
  "uuid",
  testClient(async (client) => {
    const uuid_text = "c4792ecb-c00a-43a2-bd74-5b0ed551c599";
    const result = await client.queryArray(`SELECT $1::uuid`, [uuid_text]);
    assertEquals(result.rows[0][0], uuid_text);
  }),
);

Deno.test(
  "uuid array",
  testClient(async (client) => {
    const { rows: result_1 } = await client.queryArray(
      `SELECT '{"c4792ecb-c00a-43a2-bd74-5b0ed551c599",
          "c9dd159e-d3d7-4bdf-b0ea-e51831c28e9b"}'::uuid[]`,
    );
    assertEquals(
      result_1[0],
      [[
        "c4792ecb-c00a-43a2-bd74-5b0ed551c599",
        "c9dd159e-d3d7-4bdf-b0ea-e51831c28e9b",
      ]],
    );

    const { rows: result_2 } = await client.queryArray(
      `SELECT '{{"c4792ecb-c00a-43a2-bd74-5b0ed551c599"},
          {"c9dd159e-d3d7-4bdf-b0ea-e51831c28e9b"}}'::uuid[]`,
    );
    assertEquals(
      result_2[0],
      [[
        ["c4792ecb-c00a-43a2-bd74-5b0ed551c599"],
        ["c9dd159e-d3d7-4bdf-b0ea-e51831c28e9b"],
      ]],
    );
  }),
);

Deno.test(
  "void",
  testClient(async (client) => {
    const result = await client.queryArray`SELECT PG_SLEEP(0.01)`; // `pg_sleep()` returns void.
    assertEquals(result.rows, [[""]]);
  }),
);

Deno.test(
  "bpchar",
  testClient(async (client) => {
    const result = await client.queryArray(
      "SELECT cast('U7DV6WQ26D7X2IILX5L4LTYMZUKJ5F3CEDDQV3ZSLQVYNRPX2WUA' as char(52));",
    );
    assertEquals(
      result.rows,
      [["U7DV6WQ26D7X2IILX5L4LTYMZUKJ5F3CEDDQV3ZSLQVYNRPX2WUA"]],
    );
  }),
);

Deno.test(
  "bpchar array",
  testClient(async (client) => {
    const { rows: result_1 } = await client.queryArray(
      `SELECT '{"AB1234","4321BA"}'::bpchar[]`,
    );
    assertEquals(result_1[0], [["AB1234", "4321BA"]]);

    const { rows: result_2 } = await client.queryArray(
      `SELECT '{{"AB1234"},{"4321BA"}}'::bpchar[]`,
    );
    assertEquals(result_2[0], [[["AB1234"], ["4321BA"]]]);
  }),
);

Deno.test(
  "bool",
  testClient(async (client) => {
    const result = await client.queryArray(
      `SELECT bool('y')`,
    );
    assertEquals(result.rows[0][0], true);
  }),
);

Deno.test(
  "bool array",
  testClient(async (client) => {
    const result = await client.queryArray(
      `SELECT array[bool('y'), bool('n'), bool('1'), bool('0')]`,
    );
    assertEquals(result.rows[0][0], [true, false, true, false]);
  }),
);

Deno.test(
  "bytea",
  testClient(async (client) => {
    const base64_string = randomBase64();

    const result = await client.queryArray(
      `SELECT decode('${base64_string}','base64')`,
    );

    assertEquals(result.rows[0][0], base64.decode(base64_string));
  }),
);

Deno.test(
  "bytea array",
  testClient(async (client) => {
    const strings = Array.from(
      { length: Math.ceil(Math.random() * 10) },
      randomBase64,
    );

    const result = await client.queryArray(
      `SELECT array[ ${
        strings.map((x) => `decode('${x}', 'base64')`).join(", ")
      } ]`,
    );

    assertEquals(
      result.rows[0][0],
      strings.map(base64.decode),
    );
  }),
);

Deno.test(
  "point",
  testClient(async (client) => {
    const selectRes = await client.queryArray<[Point]>(
      "SELECT point(1, 2.5)",
    );
    assertEquals(selectRes.rows, [[{ x: "1", y: "2.5" }]]);
  }),
);

Deno.test(
  "point array",
  testClient(async (client) => {
    const result1 = await client.queryArray(
      `SELECT '{"(1, 2)","(3.5, 4.1)"}'::point[]`,
    );
    assertEquals(result1.rows, [
      [[{ x: "1", y: "2" }, { x: "3.5", y: "4.1" }]],
    ]);

    const result2 = await client.queryArray(
      `SELECT array[ array[ point(1,2), point(3.5, 4.1) ], array[ point(25, 50), point(-10, -17.5) ] ]`,
    );
    assertEquals(result2.rows[0], [
      [
        [{ x: "1", y: "2" }, { x: "3.5", y: "4.1" }],
        [{ x: "25", y: "50" }, { x: "-10", y: "-17.5" }],
      ],
    ]);
  }),
);

Deno.test(
  "time",
  testClient(async (client) => {
    const result = await client.queryArray("SELECT '01:01:01'::TIME");

    assertEquals(result.rows[0][0], "01:01:01");
  }),
);

Deno.test(
  "time array",
  testClient(async (client) => {
    const result = await client.queryArray("SELECT ARRAY['01:01:01'::TIME]");

    assertEquals(result.rows[0][0], ["01:01:01"]);
  }),
);

Deno.test(
  "timestamp",
  testClient(async (client) => {
    const date = "1999-01-08 04:05:06";
    const result = await client.queryArray<[Timestamp]>(
      "SELECT $1::TIMESTAMP, 'INFINITY'::TIMESTAMP",
      [date],
    );

    assertEquals(result.rows[0], [new Date(date), Infinity]);
  }),
);

Deno.test(
  "timestamp array",
  testClient(async (client) => {
    const timestamps = [
      "2011-10-05T14:48:00.00",
      new Date().toISOString().slice(0, -1),
    ];

    const { rows: result } = await client.queryArray<[[Date, Date]]>(
      "SELECT ARRAY[$1::TIMESTAMP, $2]",
      timestamps,
    );

    assertEquals(result[0][0], timestamps.map((x) => new Date(x)));
  }),
);

Deno.test(
  "timestamptz",
  testClient(async (client) => {
    const timestamp = "1999-01-08 04:05:06+02";
    const result = await client.queryArray<[Timestamp]>(
      "SELECT $1::TIMESTAMPTZ, 'INFINITY'::TIMESTAMPTZ",
      [timestamp],
    );

    assertEquals(result.rows[0], [new Date(timestamp), Infinity]);
  }),
);

Deno.test(
  "timestamptz array",
  testClient(async (client) => {
    const timestamps = [
      "2012/04/10 10:10:30 +0000",
      new Date().toISOString(),
    ];

    const result = await client.queryArray<[[Timestamp, Timestamp]]>(
      `SELECT ARRAY[$1::TIMESTAMPTZ, $2]`,
      timestamps,
    );

    assertEquals(result.rows[0][0], [
      new Date(timestamps[0]),
      new Date(timestamps[1]),
    ]);
  }),
);

Deno.test(
  "timetz",
  testClient(async (client) => {
    const result = await client.queryArray<[string]>(
      `SELECT '01:01:01${timezone_utc}'::TIMETZ`,
    );

    assertEquals(result.rows[0][0].slice(0, 8), "01:01:01");
  }),
);

Deno.test(
  "timetz array",
  testClient(async (client) => {
    const result = await client.queryArray<[string]>(
      `SELECT ARRAY['01:01:01${timezone_utc}'::TIMETZ]`,
    );

    assertEquals(typeof result.rows[0][0][0], "string");

    assertEquals(result.rows[0][0][0].slice(0, 8), "01:01:01");
  }),
);

Deno.test(
  "xid",
  testClient(async (client) => {
    const result = await client.queryArray("SELECT '1'::xid");

    assertEquals(result.rows[0][0], 1);
  }),
);

Deno.test(
  "xid array",
  testClient(async (client) => {
    const result = await client.queryArray(
      "SELECT ARRAY['12'::xid, '4789'::xid]",
    );

    assertEquals(result.rows[0][0], [12, 4789]);
  }),
);

Deno.test(
  "float4",
  testClient(async (client) => {
    const result = await client.queryArray<[Float4, Float4]>(
      "SELECT '1'::FLOAT4, '17.89'::FLOAT4",
    );

    assertEquals(result.rows[0], ["1", "17.89"]);
  }),
);

Deno.test(
  "float4 array",
  testClient(async (client) => {
    const result = await client.queryArray<[[Float4, Float4]]>(
      "SELECT ARRAY['12.25'::FLOAT4, '4789']",
    );

    assertEquals(result.rows[0][0], ["12.25", "4789"]);
  }),
);

Deno.test(
  "float8",
  testClient(async (client) => {
    const result = await client.queryArray<[Float8, Float8]>(
      "SELECT '1'::FLOAT8, '17.89'::FLOAT8",
    );

    assertEquals(result.rows[0], ["1", "17.89"]);
  }),
);

Deno.test(
  "float8 array",
  testClient(async (client) => {
    const result = await client.queryArray<[[Float8, Float8]]>(
      "SELECT ARRAY['12.25'::FLOAT8, '4789']",
    );

    assertEquals(result.rows[0][0], ["12.25", "4789"]);
  }),
);

Deno.test(
  "tid",
  testClient(async (client) => {
    const result = await client.queryArray<[TID, TID]>(
      "SELECT '(1, 19)'::TID, '(23, 17)'::TID",
    );

    assertEquals(result.rows[0], [[1n, 19n], [23n, 17n]]);
  }),
);

Deno.test(
  "tid array",
  testClient(async (client) => {
    const result = await client.queryArray<[[TID, TID]]>(
      "SELECT ARRAY['(4681, 1869)'::TID, '(0, 17476)']",
    );

    assertEquals(result.rows[0][0], [[4681n, 1869n], [0n, 17476n]]);
  }),
);

Deno.test(
  "date",
  testClient(async (client) => {
    await client.queryArray(`SET SESSION TIMEZONE TO '${timezone}'`);
    const date_text = "2020-01-01";

    const result = await client.queryArray<[Timestamp, Timestamp]>(
      "SELECT $1::DATE, 'Infinity'::Date",
      [date_text],
    );

    assertEquals(result.rows[0], [
      date.parse(date_text, "yyyy-MM-dd"),
      Infinity,
    ]);
  }),
);

Deno.test(
  "date array",
  testClient(async (client) => {
    await client.queryArray(`SET SESSION TIMEZONE TO '${timezone}'`);
    const dates = ["2020-01-01", date.format(new Date(), "yyyy-MM-dd")];

    const { rows: result } = await client.queryArray<[[Date, Date]]>(
      "SELECT ARRAY[$1::DATE, $2]",
      dates,
    );

    assertEquals(
      result[0][0],
      dates.map((d) => date.parse(d, "yyyy-MM-dd")),
    );
  }),
);

Deno.test(
  "line",
  testClient(async (client) => {
    const result = await client.queryArray<[Line]>(
      "SELECT '[(1, 2), (3, 4)]'::LINE",
    );

    assertEquals(result.rows[0][0], { a: "1", b: "-1", c: "1" });
  }),
);

Deno.test(
  "line array",
  testClient(async (client) => {
    const result = await client.queryArray<[[Line, Line]]>(
      "SELECT ARRAY['[(1, 2), (3, 4)]'::LINE, '41, 1, -9, 25.5']",
    );

    assertEquals(result.rows[0][0], [
      { a: "1", b: "-1", c: "1" },
      {
        a: "-0.49",
        b: "-1",
        c: "21.09",
      },
    ]);
  }),
);

Deno.test(
  "line segment",
  testClient(async (client) => {
    const result = await client.queryArray<[LineSegment]>(
      "SELECT '[(1, 2), (3, 4)]'::LSEG",
    );

    assertEquals(result.rows[0][0], {
      a: { x: "1", y: "2" },
      b: { x: "3", y: "4" },
    });
  }),
);

Deno.test(
  "line segment array",
  testClient(async (client) => {
    const result = await client.queryArray<[[LineSegment, LineSegment]]>(
      "SELECT ARRAY['[(1, 2), (3, 4)]'::LSEG, '41, 1, -9, 25.5']",
    );

    assertEquals(result.rows[0][0], [
      {
        a: { x: "1", y: "2" },
        b: { x: "3", y: "4" },
      },
      {
        a: { x: "41", y: "1" },
        b: { x: "-9", y: "25.5" },
      },
    ]);
  }),
);

Deno.test(
  "box",
  testClient(async (client) => {
    const result = await client.queryArray<[Box]>(
      "SELECT '((1, 2), (3, 4))'::BOX",
    );

    assertEquals(result.rows[0][0], {
      a: { x: "3", y: "4" },
      b: { x: "1", y: "2" },
    });
  }),
);

Deno.test(
  "box array",
  testClient(async (client) => {
    const result = await client.queryArray<[[Box, Box]]>(
      "SELECT ARRAY['(1, 2), (3, 4)'::BOX, '41, 1, -9, 25.5']",
    );

    assertEquals(result.rows[0][0], [
      {
        a: { x: "3", y: "4" },
        b: { x: "1", y: "2" },
      },
      {
        a: { x: "41", y: "25.5" },
        b: { x: "-9", y: "1" },
      },
    ]);
  }),
);

Deno.test(
  "path",
  testClient(async (client) => {
    const points = Array.from(
      { length: Math.floor((Math.random() + 1) * 10) },
      generateRandomPoint,
    );

    const selectRes = await client.queryArray<[Path]>(
      `SELECT '(${points.map(({ x, y }) => `(${x},${y})`).join(",")})'::PATH`,
    );

    assertEquals(selectRes.rows[0][0], points);
  }),
);

Deno.test(
  "path array",
  testClient(async (client) => {
    const points = Array.from(
      { length: Math.floor((Math.random() + 1) * 10) },
      generateRandomPoint,
    );

    const selectRes = await client.queryArray<[[Path]]>(
      `SELECT ARRAY['(${
        points.map(({ x, y }) => `(${x},${y})`).join(",")
      })'::PATH]`,
    );

    assertEquals(selectRes.rows[0][0][0], points);
  }),
);

Deno.test(
  "polygon",
  testClient(async (client) => {
    const points = Array.from(
      { length: Math.floor((Math.random() + 1) * 10) },
      generateRandomPoint,
    );

    const selectRes = await client.queryArray<[Polygon]>(
      `SELECT '(${
        points.map(({ x, y }) => `(${x},${y})`).join(",")
      })'::POLYGON`,
    );

    assertEquals(selectRes.rows[0][0], points);
  }),
);

Deno.test(
  "polygon array",
  testClient(async (client) => {
    const points = Array.from(
      { length: Math.floor((Math.random() + 1) * 10) },
      generateRandomPoint,
    );

    const selectRes = await client.queryArray<[[Polygon]]>(
      `SELECT ARRAY['(${
        points.map(({ x, y }) => `(${x},${y})`).join(",")
      })'::POLYGON]`,
    );

    assertEquals(selectRes.rows[0][0][0], points);
  }),
);

Deno.test(
  "circle",
  testClient(async (client) => {
    const point = generateRandomPoint();
    const radius = String(generateRandomNumber(100));

    const { rows } = await client.queryArray<[Circle]>(
      `SELECT '<(${point.x},${point.y}), ${radius}>'::CIRCLE`,
    );

    assertEquals(rows[0][0], { point, radius });
  }),
);

Deno.test(
  "circle array",
  testClient(async (client) => {
    const point = generateRandomPoint();
    const radius = String(generateRandomNumber(100));

    const { rows } = await client.queryArray<[[Circle]]>(
      `SELECT ARRAY['<(${point.x},${point.y}), ${radius}>'::CIRCLE]`,
    );

    assertEquals(rows[0][0][0], { point, radius });
  }),
);

Deno.test(
  "unhandled type",
  testClient(async (client) => {
    const { rows: exists } = await client.queryArray(
      "SELECT EXISTS (SELECT TRUE FROM PG_TYPE WHERE UPPER(TYPNAME) = 'DIRECTION')",
    );
    if (exists[0][0]) {
      await client.queryArray("DROP TYPE DIRECTION;");
    }
    await client.queryArray(
      "CREATE TYPE DIRECTION AS ENUM ( 'LEFT', 'RIGHT' )",
    );
    const { rows: result } = await client.queryArray(
      "SELECT 'LEFT'::DIRECTION;",
    );
    await client.queryArray("DROP TYPE DIRECTION;");

    assertEquals(result[0][0], "LEFT");
  }),
);

Deno.test(
  "json",
  testClient(async (client) => {
    const result = await client.queryArray
      `SELECT JSON_BUILD_OBJECT( 'X', '1' )`;

    assertEquals(result.rows[0], [{ X: "1" }]);
  }),
);

Deno.test(
  "json array",
  testClient(async (client) => {
    const json_array = await client.queryArray(
      `SELECT ARRAY_AGG(A) FROM  (
          SELECT JSON_BUILD_OBJECT( 'X', '1' ) AS A
          UNION ALL
          SELECT JSON_BUILD_OBJECT( 'Y', '2' ) AS A
        )	A`,
    );

    assertEquals(json_array.rows[0][0], [{ X: "1" }, { Y: "2" }]);

    const jsonArrayNested = await client.queryArray(
      `SELECT ARRAY[ARRAY[ARRAY_AGG(A), ARRAY_AGG(A)], ARRAY[ARRAY_AGG(A), ARRAY_AGG(A)]] FROM  (
          SELECT JSON_BUILD_OBJECT( 'X', '1' ) AS A
          UNION ALL
          SELECT JSON_BUILD_OBJECT( 'Y', '2' ) AS A
        )	A`,
    );

    assertEquals(
      jsonArrayNested.rows[0][0],
      [
        [
          [{ X: "1" }, { Y: "2" }],
          [{ X: "1" }, { Y: "2" }],
        ],
        [
          [{ X: "1" }, { Y: "2" }],
          [{ X: "1" }, { Y: "2" }],
        ],
      ],
    );
  }),
);
