import {
  assertEquals,
  assertThrowsAsync,
  deferred,
  joinPath,
  streams,
} from "./test_deps.ts";
import {
  getClearConfiguration,
  getClearSocketConfiguration,
  getMainConfiguration,
  getMd5Configuration,
  getMd5SocketConfiguration,
  getScramConfiguration,
  getScramSocketConfiguration,
  getTlsOnlyConfiguration,
} from "./config.ts";
import { Client, ConnectionError, PostgresError } from "../mod.ts";
import { getSocketName } from "../utils/utils.ts";

function createProxy(
  target: Deno.Listener,
  source: { hostname: string; port: number },
): { aborter: AbortController; proxy: Promise<void> } {
  const aborter = new AbortController();

  const proxy = (async () => {
    for await (const conn of target) {
      let aborted = false;

      const outbound = await Deno.connect({
        hostname: source.hostname,
        port: source.port,
      });
      aborter.signal.addEventListener("abort", () => {
        conn.close();
        outbound.close();
        aborted = true;
      });
      await Promise.all([
        streams.copy(conn, outbound),
        streams.copy(outbound, conn),
      ]).catch(() => {});

      if (!aborted) {
        conn.close();
        outbound.close();
      }
    }
  })();

  return { aborter, proxy };
}

function getRandomString() {
  return Math.random().toString(36).substring(7);
}

Deno.test("Clear password authentication (unencrypted)", async () => {
  const client = new Client(getClearConfiguration(false));
  await client.connect();

  try {
    assertEquals(client.session.tls, false);
    assertEquals(client.session.transport, "tcp");
  } finally {
    await client.end();
  }
});

Deno.test("Clear password authentication (tls)", async () => {
  const client = new Client(getClearConfiguration(true));
  await client.connect();

  try {
    assertEquals(client.session.tls, true);
    assertEquals(client.session.transport, "tcp");
  } finally {
    await client.end();
  }
});

Deno.test("Clear password authentication (socket)", async () => {
  const client = new Client(getClearSocketConfiguration());
  await client.connect();

  try {
    assertEquals(client.session.tls, undefined);
    assertEquals(client.session.transport, "socket");
  } finally {
    await client.end();
  }
});

Deno.test("MD5 authentication (unencrypted)", async () => {
  const client = new Client(getMd5Configuration(false));
  await client.connect();

  try {
    assertEquals(client.session.tls, false);
    assertEquals(client.session.transport, "tcp");
  } finally {
    await client.end();
  }
});

Deno.test("MD5 authentication (tls)", async () => {
  const client = new Client(getMd5Configuration(true));
  await client.connect();

  try {
    assertEquals(client.session.tls, true);
    assertEquals(client.session.transport, "tcp");
  } finally {
    await client.end();
  }
});

Deno.test("MD5 authentication (socket)", async () => {
  const client = new Client(getMd5SocketConfiguration());
  await client.connect();

  try {
    assertEquals(client.session.tls, undefined);
    assertEquals(client.session.transport, "socket");
  } finally {
    await client.end();
  }
});

Deno.test("SCRAM-SHA-256 authentication (unencrypted)", async () => {
  const client = new Client(getScramConfiguration(false));
  await client.connect();

  try {
    assertEquals(client.session.tls, false);
    assertEquals(client.session.transport, "tcp");
  } finally {
    await client.end();
  }
});

Deno.test("SCRAM-SHA-256 authentication (tls)", async () => {
  const client = new Client(getScramConfiguration(true));
  await client.connect();

  try {
    assertEquals(client.session.tls, true);
    assertEquals(client.session.transport, "tcp");
  } finally {
    await client.end();
  }
});

Deno.test("SCRAM-SHA-256 authentication (socket)", async () => {
  const client = new Client(getScramSocketConfiguration());
  await client.connect();

  try {
    assertEquals(client.session.tls, undefined);
    assertEquals(client.session.transport, "socket");
  } finally {
    await client.end();
  }
});

Deno.test("Skips TLS connection when TLS disabled", async () => {
  const client = new Client({
    ...getTlsOnlyConfiguration(),
    tls: { enabled: false },
  });

  // Connection will fail due to TLS only user
  try {
    await assertThrowsAsync(
      () => client.connect(),
      PostgresError,
      "no pg_hba.conf",
    );
  } finally {
    try {
      assertEquals(client.session.tls, undefined);
      assertEquals(client.session.transport, undefined);
    } finally {
      await client.end();
    }
  }
});

Deno.test("Aborts TLS connection when certificate is untrusted", async () => {
  // Force TLS but don't provide CA
  const client = new Client({
    ...getTlsOnlyConfiguration(),
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
    try {
      assertEquals(client.session.tls, undefined);
      assertEquals(client.session.transport, undefined);
    } finally {
      await client.end();
    }
  }
});

Deno.test("Defaults to unencrypted when certificate is invalid and TLS is not enforced", async () => {
  // Remove CA, request tls and disable enforce
  const client = new Client({
    ...getMainConfiguration(),
    tls: { enabled: true, enforce: false },
  });

  await client.connect();

  // Connection will fail due to TLS only user
  try {
    assertEquals(client.session.tls, false);
    assertEquals(client.session.transport, "tcp");
  } finally {
    await client.end();
  }
});

Deno.test("Handles bad authentication correctly", async function () {
  const badConnectionData = getMainConfiguration();
  badConnectionData.password += getRandomString();
  const client = new Client(badConnectionData);

  try {
    await assertThrowsAsync(
      async (): Promise<void> => {
        await client.connect();
      },
      PostgresError,
      "password authentication failed for user",
    );
  } finally {
    await client.end();
  }
});

// This test requires current user database connection permissions
// on "pg_hba.conf" set to "all"
Deno.test("Startup error when database does not exist", async function () {
  const badConnectionData = getMainConfiguration();
  badConnectionData.database += getRandomString();
  const client = new Client(badConnectionData);

  try {
    await assertThrowsAsync(
      async (): Promise<void> => {
        await client.connect();
      },
      PostgresError,
      "does not exist",
    );
  } finally {
    await client.end();
  }
});

Deno.test("Exposes session PID", async () => {
  const client = new Client(getMainConfiguration());
  await client.connect();

  try {
    const { rows } = await client.queryObject<{ pid: string }>(
      "SELECT PG_BACKEND_PID() AS PID",
    );
    assertEquals(client.session.pid, rows[0].pid);
  } finally {
    await client.end();

    assertEquals(
      client.session.pid,
      undefined,
      "PID was not cleared after disconnection",
    );
  }
});

Deno.test("Exposes session encryption", async () => {
  const client = new Client(getMainConfiguration());
  await client.connect();

  try {
    assertEquals(client.session.tls, true);
  } finally {
    await client.end();

    assertEquals(
      client.session.tls,
      undefined,
      "TLS was not cleared after disconnection",
    );
  }
});

Deno.test("Exposes session transport", async () => {
  const client = new Client(getMainConfiguration());
  await client.connect();

  try {
    assertEquals(client.session.transport, "tcp");
  } finally {
    await client.end();

    assertEquals(
      client.session.transport,
      undefined,
      "Transport was not cleared after disconnection",
    );
  }
});

Deno.test("Attempts to guess socket route", async () => {
  await assertThrowsAsync(
    async () => {
      const mock_socket = await Deno.makeTempFile({
        prefix: ".postgres_socket.",
      });

      const client = new Client({
        database: "some_database",
        hostname: mock_socket,
        host_type: "socket",
        user: "some_user",
      });
      await client.connect();
    },
    Deno.errors.ConnectionRefused,
    undefined,
    "It doesn't use exact file name when real file provided",
  );

  const path = await Deno.makeTempDir({ prefix: "postgres_socket" });
  const port = 1234;

  await assertThrowsAsync(
    async () => {
      const client = new Client({
        database: "some_database",
        hostname: path,
        host_type: "socket",
        user: "some_user",
        port,
      });
      await client.connect();
    },
    ConnectionError,
    `Could not open socket in path "${joinPath(path, getSocketName(port))}"`,
    "It doesn't guess socket location based on port",
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
    ...getMainConfiguration(),
    connection: {
      attempts: 1,
    },
  });
  await client.connect();

  try {
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
      "The session was terminated unexpectedly",
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
  } finally {
    await client.end();
  }
});

Deno.test("Attempts reconnection on socket disconnection", async () => {
  const client = new Client(getMd5SocketConfiguration());
  await client.connect();

  try {
    await assertThrowsAsync(
      () =>
        client.queryArray`SELECT PG_TERMINATE_BACKEND(${client.session.pid})`,
      ConnectionError,
      "The session was terminated unexpectedly",
    );

    const { rows: query_1 } = await client.queryArray`SELECT 1`;
    assertEquals(query_1, [[1]]);
  } finally {
    await client.end();
  }
});

// TODO
// Find a way to unlink the socket to simulate unexpected socket disconnection

Deno.test("Attempts reconnection when connection is lost", async function () {
  const cfg = getMainConfiguration();
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });

  const { aborter, proxy } = createProxy(listener, {
    hostname: cfg.hostname,
    port: Number(cfg.port),
  });

  const client = new Client({
    ...cfg,
    hostname: "127.0.0.1",
    port: (listener.addr as Deno.NetAddr).port,
    tls: {
      enabled: false,
    },
  });

  await client.queryObject("SELECT 1");

  // This closes ongoing connections. The original connection is now dead, so
  // a new connection should be established.
  aborter.abort();

  await assertThrowsAsync(
    () => client.queryObject("SELECT 1"),
    ConnectionError,
    "The session was terminated unexpectedly",
  );

  // Make sure the connection was reestablished once the server comes back online
  await client.queryObject("SELECT 1");
  await client.end();

  listener.close();
  await proxy;
});

Deno.test("Doesn't attempt reconnection when attempts are set to zero", async function () {
  const client = new Client({
    ...getMainConfiguration(),
    connection: { attempts: 0 },
  });
  await client.connect();

  try {
    await assertThrowsAsync(() =>
      client.queryArray`SELECT PG_TERMINATE_BACKEND(${client.session.pid})`
    );
    assertEquals(client.connected, false);

    await assertThrowsAsync(
      () => client.queryArray`SELECT 1`,
      Error,
      "The client has been disconnected from the database",
    );
  } finally {
    // End the connection in case the previous assertions failed
    await client.end();
  }
});
