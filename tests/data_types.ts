import { assertEquals, decodeBase64, encodeBase64 } from "../test_deps.ts";
import { Client } from "../mod.ts";
import TEST_CONNECTION_PARAMS from "./config.ts";
import { getTestClient } from "./helpers.ts";

const SETUP = [
  "DROP TABLE IF EXISTS data_types;",
  `CREATE TABLE data_types(
     inet_t inet,
     macaddr_t macaddr,
     cidr_t cidr
  );`,
];

const CLIENT = new Client(TEST_CONNECTION_PARAMS);

const testClient = getTestClient(CLIENT, SETUP);

testClient(async function inet() {
  const inet = "127.0.0.1";
  await CLIENT.query(
    "INSERT INTO data_types (inet_t) VALUES($1)",
    inet,
  );
  const selectRes = await CLIENT.query(
    "SELECT inet_t FROM data_types WHERE inet_t=$1",
    inet,
  );
  assertEquals(selectRes.rows[0][0], inet);
});

testClient(async function inetArray() {
  const selectRes = await CLIENT.query(
    "SELECT '{ 127.0.0.1, 192.168.178.0/24 }'::inet[]",
  );
  assertEquals(selectRes.rows[0], [["127.0.0.1", "192.168.178.0/24"]]);
});

testClient(async function inetNestedArray() {
  const selectRes = await CLIENT.query(
    "SELECT '{{127.0.0.1},{192.168.178.0/24}}'::inet[]",
  );
  assertEquals(selectRes.rows[0], [[["127.0.0.1"], ["192.168.178.0/24"]]]);
});

testClient(async function macaddr() {
  const macaddr = "08:00:2b:01:02:03";
  await CLIENT.query(
    "INSERT INTO data_types (macaddr_t) VALUES($1)",
    macaddr,
  );
  const selectRes = await CLIENT.query(
    "SELECT macaddr_t FROM data_types WHERE macaddr_t=$1",
    macaddr,
  );
  assertEquals(selectRes.rows, [[macaddr]]);
});

testClient(async function macaddrArray() {
  const selectRes = await CLIENT.query(
    "SELECT '{ 08:00:2b:01:02:03, 09:00:2b:01:02:04 }'::macaddr[]",
  );
  assertEquals(selectRes.rows[0], [["08:00:2b:01:02:03", "09:00:2b:01:02:04"]]);
});

testClient(async function macaddrNestedArray() {
  const selectRes = await CLIENT.query(
    "SELECT '{{08:00:2b:01:02:03},{09:00:2b:01:02:04}}'::macaddr[]",
  );
  assertEquals(
    selectRes.rows[0],
    [[["08:00:2b:01:02:03"], ["09:00:2b:01:02:04"]]],
  );
});

testClient(async function cidr() {
  const cidr = "192.168.100.128/25";
  await CLIENT.query(
    "INSERT INTO data_types (cidr_t) VALUES($1)",
    cidr,
  );
  const selectRes = await CLIENT.query(
    "SELECT cidr_t FROM data_types WHERE cidr_t=$1",
    cidr,
  );
  assertEquals(selectRes.rows, [[cidr]]);
});

testClient(async function cidrArray() {
  const selectRes = await CLIENT.query(
    "SELECT '{ 10.1.0.0/16, 11.11.11.0/24 }'::cidr[]",
  );
  assertEquals(selectRes.rows[0], [["10.1.0.0/16", "11.11.11.0/24"]]);
});

testClient(async function cidrNestedArray() {
  const selectRes = await CLIENT.query(
    "SELECT '{{10.1.0.0/16},{11.11.11.0/24}}'::cidr[]",
  );
  assertEquals(selectRes.rows[0], [[["10.1.0.0/16"], ["11.11.11.0/24"]]]);
});

testClient(async function name() {
  const result = await CLIENT.query(`SELECT 'some'::name`);
  assertEquals(result.rows[0][0], "some");
});

testClient(async function nameArray() {
  const result = await CLIENT.query(`SELECT ARRAY['some'::name, 'none']`);
  assertEquals(result.rows[0][0], ["some", "none"]);
});

testClient(async function oid() {
  const result = await CLIENT.query(`SELECT 1::oid`);
  assertEquals(result.rows[0][0], "1");
});

testClient(async function oidArray() {
  const result = await CLIENT.query(`SELECT ARRAY[1::oid, 452, 1023]`);
  assertEquals(result.rows[0][0], ["1", "452", "1023"]);
});

testClient(async function regproc() {
  const result = await CLIENT.query(`SELECT 'now'::regproc`);
  assertEquals(result.rows[0][0], "now");
});

testClient(async function regprocArray() {
  const result = await CLIENT.query(
    `SELECT ARRAY['now'::regproc, 'timeofday']`,
  );
  assertEquals(result.rows[0][0], ["now", "timeofday"]);
});

testClient(async function regprocedure() {
  const result = await CLIENT.query(`SELECT 'sum(integer)'::regprocedure`);
  assertEquals(result.rows[0][0], "sum(integer)");
});

testClient(async function regprocedureArray() {
  const result = await CLIENT.query(
    `SELECT ARRAY['sum(integer)'::regprocedure, 'max(integer)']`,
  );
  assertEquals(result.rows[0][0], ["sum(integer)", "max(integer)"]);
});

testClient(async function regoper() {
  const result = await CLIENT.query(`SELECT '!'::regoper`);
  assertEquals(result.rows[0][0], "!");
});

testClient(async function regoperArray() {
  const result = await CLIENT.query(`SELECT ARRAY['!'::regoper]`);
  assertEquals(result.rows[0][0], ["!"]);
});

testClient(async function regoperator() {
  const result = await CLIENT.query(`SELECT '!(bigint,NONE)'::regoperator`);
  assertEquals(result.rows[0][0], "!(bigint,NONE)");
});

testClient(async function regoperatorArray() {
  const result = await CLIENT.query(
    `SELECT ARRAY['!(bigint,NONE)'::regoperator, '*(integer,integer)']`,
  );
  assertEquals(result.rows[0][0], ["!(bigint,NONE)", "*(integer,integer)"]);
});

testClient(async function regclass() {
  const result = await CLIENT.query(`SELECT 'data_types'::regclass`);
  assertEquals(result.rows, [["data_types"]]);
});

testClient(async function regclassArray() {
  const result = await CLIENT.query(
    `SELECT ARRAY['data_types'::regclass, 'pg_type']`,
  );
  assertEquals(result.rows[0][0], ["data_types", "pg_type"]);
});

testClient(async function regtype() {
  const result = await CLIENT.query(`SELECT 'integer'::regtype`);
  assertEquals(result.rows[0][0], "integer");
});

testClient(async function regtypeArray() {
  const result = await CLIENT.query(
    `SELECT ARRAY['integer'::regtype, 'bigint']`,
  );
  assertEquals(result.rows[0][0], ["integer", "bigint"]);
});

// This test assumes that if the user wasn't provided through
// the config file, it will be available in the env config
testClient(async function regrole() {
  const user = TEST_CONNECTION_PARAMS.user || Deno.env.get("PGUSER");

  const result = await CLIENT.query(
    `SELECT ($1)::regrole`,
    user,
  );

  assertEquals(result.rows[0][0], user);
});

// This test assumes that if the user wasn't provided through
// the config file, it will be available in the env config
testClient(async function regroleArray() {
  const user = TEST_CONNECTION_PARAMS.user || Deno.env.get("PGUSER");

  const result = await CLIENT.query(
    `SELECT ARRAY[($1)::regrole]`,
    user,
  );

  assertEquals(result.rows[0][0], [user]);
});

testClient(async function regnamespace() {
  const result = await CLIENT.query(`SELECT 'public'::regnamespace;`);
  assertEquals(result.rows[0][0], "public");
});

testClient(async function regnamespaceArray() {
  const result = await CLIENT.query(
    `SELECT ARRAY['public'::regnamespace, 'pg_catalog'];`,
  );
  assertEquals(result.rows[0][0], ["public", "pg_catalog"]);
});

testClient(async function regconfig() {
  const result = await CLIENT.query(`SElECT 'english'::regconfig`);
  assertEquals(result.rows, [["english"]]);
});

testClient(async function regconfigArray() {
  const result = await CLIENT.query(
    `SElECT ARRAY['english'::regconfig, 'spanish']`,
  );
  assertEquals(result.rows[0][0], ["english", "spanish"]);
});

testClient(async function regdictionary() {
  const result = await CLIENT.query("SELECT 'simple'::regdictionary");
  assertEquals(result.rows[0][0], "simple");
});

testClient(async function regdictionaryArray() {
  const result = await CLIENT.query("SELECT ARRAY['simple'::regdictionary]");
  assertEquals(result.rows[0][0], ["simple"]);
});

testClient(async function bigint() {
  const result = await CLIENT.query("SELECT 9223372036854775807");
  assertEquals(result.rows[0][0], 9223372036854775807n);
});

testClient(async function bigintArray() {
  const result = await CLIENT.query(
    "SELECT ARRAY[9223372036854775807, 789141]",
  );
  assertEquals(result.rows[0][0], [9223372036854775807n, 789141n]);
});

testClient(async function numeric() {
  const numeric = "1234567890.1234567890";
  const result = await CLIENT.query(`SELECT $1::numeric`, numeric);
  assertEquals(result.rows, [[numeric]]);
});

testClient(async function numericArray() {
  const numeric = ["1234567890.1234567890", "6107693.123123124"];
  const result = await CLIENT.query(
    `SELECT ARRAY[$1::numeric, $2]`,
    numeric[0],
    numeric[1],
  );
  assertEquals(result.rows[0][0], numeric);
});

testClient(async function integerArray() {
  const result = await CLIENT.query("SELECT '{1,100}'::int[]");
  assertEquals(result.rows[0], [[1, 100]]);
});

testClient(async function integerNestedArray() {
  const result = await CLIENT.query("SELECT '{{1},{100}}'::int[]");
  assertEquals(result.rows[0], [[[1], [100]]]);
});

testClient(async function char() {
  await CLIENT.query(
    `CREATE TEMP TABLE CHAR_TEST (X CHARACTER(2));`,
  );
  await CLIENT.query(
    `INSERT INTO CHAR_TEST (X) VALUES ('A');`,
  );
  const result = await CLIENT.query(
    `SELECT X FROM CHAR_TEST`,
  );
  assertEquals(result.rows[0][0], "A ");
});

testClient(async function charArray() {
  const result = await CLIENT.query(
    `SELECT '{"x","Y"}'::char[]`,
  );
  assertEquals(result.rows[0][0], ["x", "Y"]);
});

testClient(async function text() {
  const result = await CLIENT.query(
    `SELECT 'ABCD'::text`,
  );
  assertEquals(result.rows[0][0], "ABCD");
});

testClient(async function textArray() {
  const result = await CLIENT.query(
    `SELECT '{"(ZYX)-123-456","(ABC)-987-654"}'::text[]`,
  );
  assertEquals(result.rows[0], [["(ZYX)-123-456", "(ABC)-987-654"]]);
});

testClient(async function textNestedArray() {
  const result = await CLIENT.query(
    `SELECT '{{"(ZYX)-123-456"},{"(ABC)-987-654"}}'::text[]`,
  );
  assertEquals(result.rows[0], [[["(ZYX)-123-456"], ["(ABC)-987-654"]]]);
});

testClient(async function varchar() {
  const result = await CLIENT.query(
    `SELECT 'ABC'::varchar`,
  );
  assertEquals(result.rows[0][0], "ABC");
});

testClient(async function varcharArray() {
  const result = await CLIENT.query(
    `SELECT '{"(ZYX)-(PQR)-456","(ABC)-987-(?=+)"}'::varchar[]`,
  );
  assertEquals(result.rows[0], [["(ZYX)-(PQR)-456", "(ABC)-987-(?=+)"]]);
});

testClient(async function varcharNestedArray() {
  const result = await CLIENT.query(
    `SELECT '{{"(ZYX)-(PQR)-456"},{"(ABC)-987-(?=+)"}}'::varchar[]`,
  );
  assertEquals(result.rows[0], [[["(ZYX)-(PQR)-456"], ["(ABC)-987-(?=+)"]]]);
});

testClient(async function uuid() {
  const uuid = "c4792ecb-c00a-43a2-bd74-5b0ed551c599";
  const result = await CLIENT.query(`SELECT $1::uuid`, uuid);
  assertEquals(result.rows, [[uuid]]);
});

testClient(async function uuidArray() {
  const result = await CLIENT.query(
    `SELECT '{"c4792ecb-c00a-43a2-bd74-5b0ed551c599",
      "c9dd159e-d3d7-4bdf-b0ea-e51831c28e9b"}'::uuid[]`,
  );
  assertEquals(
    result.rows[0],
    [[
      "c4792ecb-c00a-43a2-bd74-5b0ed551c599",
      "c9dd159e-d3d7-4bdf-b0ea-e51831c28e9b",
    ]],
  );
});

testClient(async function uuidNestedArray() {
  const result = await CLIENT.query(
    `SELECT '{{"c4792ecb-c00a-43a2-bd74-5b0ed551c599"},
      {"c9dd159e-d3d7-4bdf-b0ea-e51831c28e9b"}}'::uuid[]`,
  );
  assertEquals(
    result.rows[0],
    [[
      ["c4792ecb-c00a-43a2-bd74-5b0ed551c599"],
      ["c9dd159e-d3d7-4bdf-b0ea-e51831c28e9b"],
    ]],
  );
});

testClient(async function voidType() {
  const result = await CLIENT.query("select pg_sleep(0.01)"); // `pg_sleep()` returns void.
  assertEquals(result.rows, [[""]]);
});

testClient(async function bpcharType() {
  const result = await CLIENT.query(
    "SELECT cast('U7DV6WQ26D7X2IILX5L4LTYMZUKJ5F3CEDDQV3ZSLQVYNRPX2WUA' as char(52));",
  );
  assertEquals(
    result.rows,
    [["U7DV6WQ26D7X2IILX5L4LTYMZUKJ5F3CEDDQV3ZSLQVYNRPX2WUA"]],
  );
});

testClient(async function bpcharArray() {
  const result = await CLIENT.query(`SELECT '{"AB1234","4321BA"}'::bpchar[]`);
  assertEquals(result.rows[0], [["AB1234", "4321BA"]]);
});

testClient(async function bpcharNestedArray() {
  const result = await CLIENT.query(
    `SELECT '{{"AB1234"},{"4321BA"}}'::bpchar[]`,
  );
  assertEquals(result.rows[0], [[["AB1234"], ["4321BA"]]]);
});

testClient(async function jsonArray() {
  const jsonArray = await CLIENT.query(
    `SELECT ARRAY_AGG(A) FROM  (
      SELECT JSON_BUILD_OBJECT( 'X', '1' ) AS A
      UNION ALL
      SELECT JSON_BUILD_OBJECT( 'Y', '2' ) AS A
    )	A`,
  );

  assertEquals(jsonArray.rows[0][0], [{ X: "1" }, { Y: "2" }]);

  const jsonArrayNested = await CLIENT.query(
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
});

testClient(async function bool() {
  const result = await CLIENT.query(
    `SELECT bool('y')`,
  );
  assertEquals(result.rows[0][0], true);
});

testClient(async function boolArray() {
  const result = await CLIENT.query(
    `SELECT array[bool('y'), bool('n'), bool('1'), bool('0')]`,
  );
  assertEquals(result.rows[0][0], [true, false, true, false]);
});

const CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
function randomBase64(): string {
  return encodeBase64(
    Array.from(
      { length: Math.ceil(Math.random() * 256) },
      () => CHARS[Math.floor(Math.random() * CHARS.length)],
    ).join(""),
  );
}

testClient(async function bytea() {
  const base64 = randomBase64();

  const result = await CLIENT.query(
    `SELECT decode('${base64}','base64')`,
  );

  assertEquals(result.rows[0][0], decodeBase64(base64));
});

testClient(async function byteaArray() {
  const strings = Array.from(
    { length: Math.ceil(Math.random() * 10) },
    randomBase64,
  );

  const result = await CLIENT.query(
    `SELECT array[ ${
      strings.map((x) => `decode('${x}', 'base64')`).join(", ")
    } ]`,
  );

  assertEquals(
    result.rows[0][0],
    strings.map(decodeBase64),
  );
});

testClient(async function point() {
  const selectRes = await CLIENT.query(
    "SELECT point(1, 2)",
  );
  assertEquals(selectRes.rows, [[{ x: 1, y: 2 }]]);
});

testClient(async function pointArray() {
  const result1 = await CLIENT.query(
    `SELECT '{"(1, 2)","(3.5, 4.1)"}'::point[]`,
  );
  assertEquals(result1.rows, [
    [[{ x: 1, y: 2 }, { x: 3.5, y: 4.1 }]],
  ]);

  const result2 = await CLIENT.query(
    `SELECT array[ point(1,2), point(3.5, 4.1) ]`,
  );
  assertEquals(result2.rows, [
    [[{ x: 1, y: 2 }, { x: 3.5, y: 4.1 }]],
  ]);

  const result3 = await CLIENT.query(
    `SELECT array[ array[ point(1,2), point(3.5, 4.1) ], array[ point(25, 50), point(-10, -17.5) ] ]`,
  );
  assertEquals(result3.rows[0], [
    [
      [{ x: 1, y: 2 }, { x: 3.5, y: 4.1 }],
      [{ x: 25, y: 50 }, { x: -10, y: -17.5 }],
    ],
  ]);
});
