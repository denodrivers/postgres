import {
  assertEquals,
  assertThrowsAsync,
  deferred,
  fromFileUrl,
} from "./test_deps.ts";
import {
  getTlsMainConfiguration,
  getUnencryptedClearConfiguration,
  getUnencryptedMainConfiguration,
  getUnencryptedMd5Configuration,
  getUnencryptedScramConfiguration,
} from "./config.ts";
import { Client, PostgresError } from "../mod.ts";
import { ConnectionError } from "../connection/warning.ts";

function getRandomString() {
  return Math.random().toString(36).substring(7);
}

Deno.test("Clear password authentication (no tls)", async () => {
  const client = new Client(getUnencryptedClearConfiguration());
  await client.connect();
  await client.end();
});

Deno.test("MD5 authentication (no tls)", async () => {
  const client = new Client(getUnencryptedMd5Configuration());
  await client.connect();
  await client.end();
});

Deno.test("SCRAM-SHA-256 authentication (no tls)", async () => {
  const client = new Client(getUnencryptedScramConfiguration());
  await client.connect();
  await client.end();
});

Deno.test("TLS (certificate untrusted)", async () => {
  const client = new Client({
    ...getTlsMainConfiguration(),
    tls: {
      enabled: true,
      enforce: true,
    },
  });

  try {
    await assertThrowsAsync(
      async (): Promise<void> => {
        await client.connect();
      },
      Error,
      "The certificate used to secure the TLS connection is invalid",
    );
  } finally {
    await client.end();
  }
});

Deno.test("Skips TLS encryption when TLS disabled", async () => {
  const client = new Client({
    ...getTlsMainConfiguration(),
    tls: { enabled: false },
  });

  try {
    await client.connect();

    const { rows } = await client.queryObject<{ result: number }>({
      fields: ["result"],
      text: "SELECT 1",
    });

    assertEquals(rows[0], { result: 1 });
  } finally {
    await client.end();
  }
});

Deno.test("Skips TLS connection when TLS disabled", async () => {
  const client = new Client({
    ...getTlsMainConfiguration(),
    tls: { enabled: false },
  });

  await client.connect();

  const { rows } = await client.queryObject<{ result: number }>({
    fields: ["result"],
    text: "SELECT 1",
  });
  assertEquals(rows[0], { result: 1 });
  await client.end();
});

Deno.test("TLS (certificate trusted)", async () => {
  const client = new Client({
    ...getTlsMainConfiguration(),
    tls: {
      caFile: fromFileUrl(
        new URL("../docker/certs/ca.crt", import.meta.url),
      ),
      enabled: true,
      enforce: true,
    },
  });
  await client.connect();
  await client.end();
});

Deno.test("Handles bad authentication correctly", async function () {
  const badConnectionData = getUnencryptedMainConfiguration();
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
Deno.test("Startup error when database does not exist", async function () {
  const badConnectionData = getUnencryptedMainConfiguration();
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

Deno.test("Exposes session PID", async () => {
  const client = new Client(getUnencryptedClearConfiguration());
  await client.connect();
  const { rows } = await client.queryObject<{ pid: string }>(
    "SELECT PG_BACKEND_PID() AS PID",
  );
  assertEquals(client.session.pid, rows[0].pid);

  await client.end();
  assertEquals(
    client.session.pid,
    undefined,
    "PID is not cleared after disconnection",
  );
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

  // The server will try to emit a message everytime it receives a connection
  // For this test we don't need them, so we just discard them
  server.onmessage = () => {};

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

async function mockReconnection(attempts: number) {
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
    connection: {
      attempts,
    },
    database: "none",
    hostname: "127.0.0.1",
    port: "8080",
    user: "none",
  });

  let connection_attempts = 0;
  server.onmessage = ({ data }) => {
    if (data !== "connection") {
      closed.reject(
        `Unexpected message "${data}" received from worker`,
      );
    }
    connection_attempts++;
  };

  try {
    await client.connect();
  } catch (e) {
    if (
      !(e instanceof Error) ||
      !e.message.startsWith("Could not check if server accepts SSL connections")
    ) {
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

  // If reconnections are set to zero, it will attempt to connect at least once, but won't
  // attempt to reconnect
  assertEquals(
    connection_attempts,
    attempts === 0 ? 1 : attempts,
    `Attempted "${connection_attempts}" reconnections, "${attempts}" expected`,
  );
}

Deno.test("Attempts reconnection on connection startup", async function () {
  await mockReconnection(5);
  await mockReconnection(0);
});

// This test ensures a failed query that is disconnected after execution but before
// status report is only executed one (regression test)
Deno.test("Attempts reconnection on disconnection", async function () {
  const client = new Client({
    ...getUnencryptedMainConfiguration(),
    connection: {
      attempts: 1,
    },
  });
  await client.connect();

  const test_table = "TEST_DENO_RECONNECTION_1";
  const test_value = 1;

  await client.queryArray(`DROP TABLE IF EXISTS ${test_table}`);
  await client.queryArray(`CREATE TABLE ${test_table} (X INT)`);

  await assertThrowsAsync(
    () =>
      client.queryArray(
        `INSERT INTO ${test_table} VALUES (${test_value}); COMMIT; SELECT PG_TERMINATE_BACKEND(${client.session.pid})`,
      ),
    ConnectionError,
    "The session was terminated by the database",
  );
  assertEquals(client.connected, false);

  const { rows: result_1 } = await client.queryObject<{ pid: string }>({
    text: "SELECT PG_BACKEND_PID() AS PID",
    fields: ["pid"],
  });
  assertEquals(
    client.session.pid,
    result_1[0].pid,
    "The PID is not reseted after reconnection",
  );

  const { rows: result_2 } = await client.queryObject<{ x: number }>({
    text: `SELECT X FROM ${test_table}`,
    fields: ["x"],
  });
  assertEquals(
    result_2.length,
    1,
  );
  assertEquals(
    result_2[0].x,
    test_value,
  );

  await client.end();
});

Deno.test("Doesn't attempt reconnection when attempts are set to zero", async function () {
  const client = new Client({
    ...getUnencryptedMainConfiguration(),
    connection: { attempts: 0 },
  });
  await client.connect();
  await assertThrowsAsync(() =>
    client.queryArray`SELECT PG_TERMINATE_BACKEND(${client.session.pid})`
  );
  assertEquals(client.connected, false);

  await assertThrowsAsync(
    () => client.queryArray`SELECT 1`,
    Error,
    "The client has been disconnected from the database",
  );
});
