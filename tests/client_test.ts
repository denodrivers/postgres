import { Client, PostgresError } from "../mod.ts";
import { assertThrowsAsync } from "./test_deps.ts";
import { getMainConfiguration } from "./config.ts";

function getRandomString() {
  return Math.random().toString(36).substring(7);
}

Deno.test("badAuthData", async function () {
  const badConnectionData = getMainConfiguration();
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

// This test requires current user database connection permissions
// on "pg_hba.conf" set to "all"
Deno.test("startupError", async function () {
  const badConnectionData = getMainConfiguration();
  badConnectionData.database += getRandomString();
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
