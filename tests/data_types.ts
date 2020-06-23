import { assertEquals } from "../test_deps.ts";
import { Client } from "../mod.ts";
import { TEST_CONNECTION_PARAMS } from "./constants.ts";
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
  const insertRes = await CLIENT.query(
    "INSERT INTO data_types (inet_t) VALUES($1)",
    inet,
  );
  const selectRes = await CLIENT.query(
    "SELECT inet_t FROM data_types WHERE inet_t=$1",
    inet,
  );
  assertEquals(selectRes.rows, [[inet]]);
});

testClient(async function inetArray() {
  const selectRes = await CLIENT.query(
    "SELECT '{ 127.0.0.1, 192.168.178.0/24 }'::inet[]"
  );
  assertEquals(selectRes.rows[0], [["127.0.0.1", "192.168.178.0/24"]]);
});

testClient(async function inetNestedArray() {
  const selectRes = await CLIENT.query(
    "SELECT '{{127.0.0.1},{192.168.178.0/24}}'::inet[]"
  );
  assertEquals(selectRes.rows[0], [[["127.0.0.1"], ["192.168.178.0/24"]]]);
});

testClient(async function macaddr() {
  const macaddr = "08:00:2b:01:02:03";
  const insertRes = await CLIENT.query(
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
    "SELECT '{ 08:00:2b:01:02:03, 09:00:2b:01:02:04 }'::macaddr[]"
  );
  assertEquals(selectRes.rows[0], [["08:00:2b:01:02:03", "09:00:2b:01:02:04"]]);
});

testClient(async function macaddrNestedArray() {
  const selectRes = await CLIENT.query(
    "SELECT '{{08:00:2b:01:02:03},{09:00:2b:01:02:04}}'::macaddr[]"
  );
  assertEquals(selectRes.rows[0], [[["08:00:2b:01:02:03"], ["09:00:2b:01:02:04"]]]);
});

testClient(async function cidr() {
  const cidr = "192.168.100.128/25";
  const insertRes = await CLIENT.query(
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
    "SELECT '{ 10.1.0.0/16, 11.11.11.0/24 }'::cidr[]"
  );
  assertEquals(selectRes.rows[0], [["10.1.0.0/16", "11.11.11.0/24"]]);
});

testClient(async function cidrNestedArray() {
  const selectRes = await CLIENT.query(
    "SELECT '{{10.1.0.0/16},{11.11.11.0/24}}'::cidr[]"
  );
  assertEquals(selectRes.rows[0], [[["10.1.0.0/16"], ["11.11.11.0/24"]]]);
});

testClient(async function oid() {
  const result = await CLIENT.query(`SELECT 1::oid`);
  assertEquals(result.rows, [["1"]]);
});

testClient(async function regproc() {
  const result = await CLIENT.query(`SELECT 'now'::regproc`);
  assertEquals(result.rows, [["now"]]);
});

testClient(async function regprocedure() {
  const result = await CLIENT.query(`SELECT 'sum(integer)'::regprocedure`);
  assertEquals(result.rows, [["sum(integer)"]]);
});

testClient(async function regoper() {
  const result = await CLIENT.query(`SELECT '!'::regoper`);
  assertEquals(result.rows, [["!"]]);
});

testClient(async function regoperator() {
  const result = await CLIENT.query(`SELECT '!(bigint,NONE)'::regoperator`);
  assertEquals(result.rows, [["!(bigint,NONE)"]]);
});

testClient(async function regclass() {
  const result = await CLIENT.query(`SELECT 'data_types'::regclass`);
  assertEquals(result.rows, [["data_types"]]);
});

testClient(async function regtype() {
  const result = await CLIENT.query(`SELECT 'integer'::regtype`);
  assertEquals(result.rows, [["integer"]]);
});

testClient(async function regrole() {
  const result = await CLIENT.query(
    `SELECT ($1)::regrole`,
    TEST_CONNECTION_PARAMS.user,
  );
  assertEquals(result.rows, [[TEST_CONNECTION_PARAMS.user]]);
});

testClient(async function regnamespace() {
  const result = await CLIENT.query(`SELECT 'public'::regnamespace;`);
  assertEquals(result.rows, [["public"]]);
});

testClient(async function regconfig() {
  const result = await CLIENT.query(`SElECT 'english'::regconfig`);
  assertEquals(result.rows, [["english"]]);
});

testClient(async function regdictionary() {
  const result = await CLIENT.query(`SElECT 'simple'::regdictionary`);
  assertEquals(result.rows, [["simple"]]);
});

testClient(async function bigint() {
  const result = await CLIENT.query("SELECT 9223372036854775807");
  assertEquals(result.rows, [["9223372036854775807"]]);
});

testClient(async function numeric() {
  const numeric = "1234567890.1234567890";
  const result = await CLIENT.query(`SELECT $1::numeric`, numeric);
  assertEquals(result.rows, [[numeric]]);
});

testClient(async function integerArray() {
  const result = await CLIENT.query("SELECT '{1,100}'::int[]");
  assertEquals(result.rows[0], [[1,100]]);
});

testClient(async function integerNestedArray() {
  const result = await CLIENT.query("SELECT '{{1},{100}}'::int[]");
  assertEquals(result.rows[0], [[[1],[100]]]);
});

testClient(async function textArray() {
  const result = await CLIENT.query(`SELECT '{"(ZYX)-123-456","(ABC)-987-654"}'::text[]`);
  assertEquals(result.rows[0], [["(ZYX)-123-456", "(ABC)-987-654"]]);
});

testClient(async function textNestedArray() {
  const result = await CLIENT.query(
    `SELECT '{{"(ZYX)-123-456"},{"(ABC)-987-654"}}'::text[]`
  );
  assertEquals(result.rows[0], [[["(ZYX)-123-456"], ["(ABC)-987-654"]]]);
});

testClient(async function varcharArray() {
  const result = await CLIENT.query(
    `SELECT '{"(ZYX)-(PQR)-456","(ABC)-987-(?=+)"}'::varchar[]`
  );
  assertEquals(result.rows[0], [["(ZYX)-(PQR)-456", "(ABC)-987-(?=+)"]]);
});

testClient(async function varcharNestedArray() {
  const result = await CLIENT.query(
    `SELECT '{{"(ZYX)-(PQR)-456"},{"(ABC)-987-(?=+)"}}'::varchar[]`
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
      "c9dd159e-d3d7-4bdf-b0ea-e51831c28e9b"}'::uuid[]`
  );
  assertEquals(result.rows[0],
               [["c4792ecb-c00a-43a2-bd74-5b0ed551c599",
                 "c9dd159e-d3d7-4bdf-b0ea-e51831c28e9b"]]);
});

testClient(async function uuidNestedArray() {
  const result = await CLIENT.query(
    `SELECT '{{"c4792ecb-c00a-43a2-bd74-5b0ed551c599"},
      {"c9dd159e-d3d7-4bdf-b0ea-e51831c28e9b"}}'::uuid[]`
  );
  assertEquals(result.rows[0],
               [[["c4792ecb-c00a-43a2-bd74-5b0ed551c599"],
                 ["c9dd159e-d3d7-4bdf-b0ea-e51831c28e9b"]]]);
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
  assertEquals(result.rows[0], [["AB1234","4321BA"]]);
});

testClient(async function bpcharNestedArray() {
  const result = await CLIENT.query(`SELECT '{{"AB1234"},{"4321BA"}}'::bpchar[]`);
  assertEquals(result.rows[0], [[["AB1234"],["4321BA"]]]);
});
