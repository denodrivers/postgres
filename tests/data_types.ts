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
  );`
];

const CLIENT = new Client(TEST_CONNECTION_PARAMS);

const testClient = getTestClient(CLIENT, SETUP);

testClient(async function inet() {
  const inet = "127.0.0.1";
  const insertRes = await CLIENT.query(
    "INSERT INTO data_types (inet_t) VALUES($1)",
    inet
  );
  const selectRes = await CLIENT.query(
    "SELECT inet_t FROM data_types WHERE inet_t=$1",
    inet
  );
  assertEquals(selectRes.rows, [[inet]]);
});

testClient(async function macaddr() {
  const macaddr = "08:00:2b:01:02:03";
  const insertRes = await CLIENT.query(
    "INSERT INTO data_types (macaddr_t) VALUES($1)",
    macaddr
  );
  const selectRes = await CLIENT.query(
    "SELECT macaddr_t FROM data_types WHERE macaddr_t=$1",
    macaddr
  );
  assertEquals(selectRes.rows, [[macaddr]]);
});

testClient(async function cidr() {
  const cidr = "192.168.100.128/25";
  const insertRes = await CLIENT.query(
    "INSERT INTO data_types (cidr_t) VALUES($1)",
    cidr
  );
  const selectRes = await CLIENT.query(
    "SELECT cidr_t FROM data_types WHERE cidr_t=$1",
    cidr
  );
  assertEquals(selectRes.rows, [[cidr]]);
});
