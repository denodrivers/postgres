import { test, assert, assertStrContains } from "../deps.ts";
import { Client, PostgresError } from "../mod.ts";
import { TEST_CONNECTION_PARAMS } from "./constants.ts";

test(async function badAuthData() {
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
