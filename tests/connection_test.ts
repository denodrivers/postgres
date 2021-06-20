// deno-lint-ignore-file camelcase
import { assertEquals, assertThrowsAsync, deferred } from "./test_deps.ts";
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

Deno.test("Closes connection on bad TLS availability verification", async function () {
  const server = new Worker(
    new URL("./workers/postgres_server.ts", import.meta.url).href,
    {
      type: "module",
      deno: {
        namespace: true,
      },
    },
  );

  // Await for server initialization
  const initialized = deferred();
  server.onmessage = ({ data }) => {
    if (data !== "initialized") {
      initialized.reject(`Unexpected message "${data}" received from worker`);
    }
    initialized.resolve();
  };
  server.postMessage("initialize");
  await initialized;

  const client = new Client({
    database: "none",
    hostname: "127.0.0.1",
    port: "8080",
    user: "none",
  });

  let bad_tls_availability_message = false;
  try {
    await client.connect();
  } catch (e) {
    if (
      e instanceof Error ||
      e.message.startsWith("Could not check if server accepts SSL connections")
    ) {
      bad_tls_availability_message = true;
    } else {
      // Early fail, if the connection fails for an unexpected error
      server.terminate();
      throw e;
    }
  } finally {
    await client.end();
  }

  const closed = deferred();
  server.onmessage = ({ data }) => {
    if (data !== "closed") {
      closed.reject(
        `Unexpected message "${data}" received from worker`,
      );
    }
    closed.resolve();
  };
  server.postMessage("close");
  await closed;
  server.terminate();

  assertEquals(bad_tls_availability_message, true);
});

Deno.test("Handles invalid TLS certificates correctly", async () => {
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
