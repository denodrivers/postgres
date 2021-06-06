import { assertThrowsAsync } from "./test_deps.ts";
import {
  getClearConfiguration,
  getInvalidTlsConfiguration,
  getMainConfiguration,
  getMd5Configuration,
  getScramSha256Configuration,
} from "./config.ts";
import { Client, PostgresError } from "../mod.ts";

function getRandomString() {
  return Math.random().toString(36).substring(7);
}

Deno.test("Clear password authentication (no tls)", async () => {
  const client = new Client(getClearConfiguration());
  await client.connect();
  await client.end();
});

Deno.test("Handles bad authentication correctly", async function () {
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

Deno.test("Downgrades to non-encrypted connection on invalid certificate", async () => {
  const client = new Client({
    ...getInvalidTlsConfiguration(),
    tls: { enforce: false },
  });

  await client.connect();
  await client.end();
});

Deno.test("Throws on invalid certificate and enforced TLS", async () => {
  const client = new Client(getInvalidTlsConfiguration());

  await assertThrowsAsync(
    async (): Promise<void> => {
      await client.connect();
    },
    Error,
    "The certificate used to secure the TLS connection is invalid",
  )
    .finally(async () => {
      await client.end();
    });
});

Deno.test("MD5 authentication (no tls)", async () => {
  const client = new Client(getMd5Configuration());
  await client.connect();
  await client.end();
});

Deno.test("SCRAM-SHA-256 authentication (no tls)", async () => {
  const client = new Client(getScramSha256Configuration());
  await client.connect();
  await client.end();
});

// This test requires current user database connection permissions
// on "pg_hba.conf" set to "all"
Deno.test("Startup error when database does not exist", async function () {
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
