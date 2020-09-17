const { test } = Deno;
import { Client, PostgresError } from "../mod.ts";
import { assert, assertStringContains } from "../test_deps.ts";
import { TEST_CONNECTION_PARAMS } from "./constants.ts";

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
    assertStringContains(e.message, "password authentication failed for user");
  } finally {
    await client.end();
  }
  assert(thrown);
});

test("string client connection", async function () {
  const { user, password, database, hostname, port } = TEST_CONNECTION_PARAMS;
  const client = new Client(
    `pgsql://${user}:${password}@${hostname}:${port}/${database}`,
  );
  const result = await client.query("SELECT * FROM ids;");
  assert(result);
});
