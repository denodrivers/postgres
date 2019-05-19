import { test, assert, assertStrContains } from "../deps.ts";
import { Client, PostgresError } from "../mod.ts";
import { TEST_CONNECTION_PARAMS } from "./constants.ts";

test(async function badAuthData() {
  // TODO(bartlomieju): this fails on Travis because it trusts all connections to postgres
  // figure out how to make it work
  return;
  
  const badConnectionData = { ...TEST_CONNECTION_PARAMS };
  badConnectionData.password += "foobar";
  const client = new Client(badConnectionData);

  let thrown = false;

  try {
    await client.connect();
  } catch (e) {
    thrown = true;
    assert(e instanceof PostgresError);
    assertStrContains(e.message, "password authentication failed for user");
  } finally {
    await client.end();
  }
  assert(thrown);
});
