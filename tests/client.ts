const { test } = Deno;
import { Client, PostgresError } from "../mod.ts";
import { assert } from "../test_deps.ts";
import TEST_CONNECTION_PARAMS from "./config.ts";

test("badAuthData", async function () {
  const badConnectionData = { ...TEST_CONNECTION_PARAMS };
  badConnectionData.password += "foobar";
  const client = new Client(badConnectionData);

  let thrown = false;

  try {
    await client.connect();
  } catch (e) {
    thrown = true;
    assert(e instanceof PostgresError);
    assert(e.message.includes("password authentication failed for user"));
  } finally {
    await client.end();
  }
  assert(thrown);
});
