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

testClient(async function voidType() {
  const result = await CLIENT.query("select pg_sleep(0.01)"); // `pg_sleep()` returns void.
  assertEquals(result.rows, [[""]]);
});
