const { test } = Deno;
import { Client, PostgresError } from "../mod.ts";
import { assert, assertThrowsAsync } from "../test_deps.ts";
import TEST_CONNECTION_PARAMS from "./config.ts";

function getRandomString() {
  return Math.random().toString(36).substring(7);
}

test("badAuthData", async function () {
  const badConnectionData = { ...TEST_CONNECTION_PARAMS };
  badConnectionData.password += getRandomString();
  const client = new Client(badConnectionData);

  await assertThrowsAsync(
    async (): Promise<void> => {
      await client.connect();
    },
    PostgresError,
    "password authentication failed for user",
  )
    .finally(async () => {
      await client.end();
    });
});

test("Startup errors are handled", async function () {
  const badConnectionData = { ...TEST_CONNECTION_PARAMS };
  badConnectionData.user += getRandomString();
  const client = new Client(badConnectionData);

  await assertThrowsAsync(
    async (): Promise<void> => {
      await client.connect();
    },
    PostgresError,
    "does not exist",
  )
    .finally(async () => {
      await client.end();
    });
});
