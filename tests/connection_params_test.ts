import { assertEquals, assertThrows, fromFileUrl } from "./test_deps.ts";
import { createParams } from "../connection/connection_params.ts";
import { ConnectionParamsError } from "../client/error.ts";

/**
 * This function is ment to be used as a container for env based tests.
 * It will mutate the env state and run the callback passed to it, then
 * reset the env variables to it's original state
 *
 * It can only be used in tests that run with env permissions
 */
const withEnv = (env: {
  database: string;
  host: string;
  user: string;
  port: string;
}, fn: () => void) => {
  const PGDATABASE = Deno.env.get("PGDATABASE");
  const PGHOST = Deno.env.get("PGHOST");
  const PGPORT = Deno.env.get("PGPORT");
  const PGUSER = Deno.env.get("PGUSER");

  Deno.env.set("PGDATABASE", env.database);
  Deno.env.set("PGHOST", env.host);
  Deno.env.set("PGPORT", env.port);
  Deno.env.set("PGUSER", env.user);

  fn();

  // Reset to original state
  PGDATABASE
    ? Deno.env.set("PGDATABASE", PGDATABASE)
    : Deno.env.delete("PGDATABASE");
  PGHOST ? Deno.env.set("PGHOST", PGHOST) : Deno.env.delete("PGHOST");
  PGPORT ? Deno.env.set("PGPORT", PGPORT) : Deno.env.delete("PGPORT");
  PGUSER ? Deno.env.set("PGUSER", PGUSER) : Deno.env.delete("PGUSER");
};

Deno.test("Parses connection string", function () {
  const p = createParams(
    "postgres://some_user@some_host:10101/deno_postgres",
  );

  assertEquals(p.database, "deno_postgres");
  assertEquals(p.host_type, "tcp");
  assertEquals(p.hostname, "some_host");
  assertEquals(p.port, 10101);
  assertEquals(p.user, "some_user");
});

Deno.test("Parses connection string with socket host", function () {
  const socket = "/var/run/postgresql";

  const p = createParams(
    `postgres://some_user@${encodeURIComponent(socket)}:10101/deno_postgres`,
  );

  assertEquals(p.database, "deno_postgres");
  assertEquals(p.hostname, socket);
  assertEquals(p.host_type, "socket");
  assertEquals(p.port, 10101);
  assertEquals(p.user, "some_user");
});

Deno.test('Parses connection string with "postgresql" as driver', function () {
  const p = createParams(
    "postgresql://some_user@some_host:10101/deno_postgres",
  );

  assertEquals(p.database, "deno_postgres");
  assertEquals(p.user, "some_user");
  assertEquals(p.hostname, "some_host");
  assertEquals(p.port, 10101);
});

Deno.test("Parses connection string without port", function () {
  const p = createParams(
    "postgres://some_user@some_host/deno_postgres",
  );

  assertEquals(p.database, "deno_postgres");
  assertEquals(p.user, "some_user");
  assertEquals(p.hostname, "some_host");
  assertEquals(p.port, 5432);
});

Deno.test("Parses connection string with application name", function () {
  const p = createParams(
    "postgres://some_user@some_host:10101/deno_postgres?application_name=test_app",
  );

  assertEquals(p.database, "deno_postgres");
  assertEquals(p.user, "some_user");
  assertEquals(p.hostname, "some_host");
  assertEquals(p.applicationName, "test_app");
  assertEquals(p.port, 10101);
});

Deno.test("Parses connection string with reserved URL parameters", () => {
  const p = createParams(
    "postgres://?dbname=some_db&user=some_user",
  );

  assertEquals(p.database, "some_db");
  assertEquals(p.user, "some_user");
});

Deno.test("Parses connection string with sslmode required", function () {
  const p = createParams(
    "postgres://some_user@some_host:10101/deno_postgres?sslmode=require",
  );

  assertEquals(p.tls.enabled, true);
  assertEquals(p.tls.enforce, true);
});

Deno.test("Parses connection string with options", () => {
  {
    const params = {
      x: "1",
      y: "2",
    };

    const params_as_args = Object.entries(params).map(([key, value]) =>
      `--${key}=${value}`
    ).join(" ");

    const p = createParams(
      `postgres://some_user@some_host:10101/deno_postgres?options=${
        encodeURIComponent(params_as_args)
      }`,
    );

    assertEquals(p.options, params);
  }

  // Test arguments provided with the -c flag
  {
    const params = {
      x: "1",
      y: "2",
    };

    const params_as_args = Object.entries(params).map(([key, value]) =>
      `-c ${key}=${value}`
    ).join(" ");

    const p = createParams(
      `postgres://some_user@some_host:10101/deno_postgres?options=${
        encodeURIComponent(params_as_args)
      }`,
    );

    assertEquals(p.options, params);
  }
});

Deno.test("Throws on connection string with invalid options", () => {
  assertThrows(
    () =>
      createParams(
        `postgres://some_user@some_host:10101/deno_postgres?options=z`,
      ),
    Error,
    `Value "z" is not a valid options argument`,
  );

  assertThrows(
    () =>
      createParams(
        `postgres://some_user@some_host:10101/deno_postgres?options=${
          encodeURIComponent("-c")
        }`,
      ),
    Error,
    `No provided value for "-c" in options parameter`,
  );

  assertThrows(
    () =>
      createParams(
        `postgres://some_user@some_host:10101/deno_postgres?options=${
          encodeURIComponent("-c a")
        }`,
      ),
    Error,
    `Value "a" is not a valid options argument`,
  );

  assertThrows(
    () =>
      createParams(
        `postgres://some_user@some_host:10101/deno_postgres?options=${
          encodeURIComponent("-b a=1")
        }`,
      ),
    Error,
    `Argument "-b" is not supported in options parameter`,
  );
});

Deno.test("Throws on connection string with invalid driver", function () {
  assertThrows(
    () =>
      createParams(
        "somedriver://some_user@some_host:10101/deno_postgres",
      ),
    undefined,
    "Supplied DSN has invalid driver: somedriver.",
  );
});

Deno.test("Throws on connection string with invalid port", function () {
  assertThrows(
    () =>
      createParams(
        "postgres://some_user@some_host:abc/deno_postgres",
      ),
    ConnectionParamsError,
    "Could not parse the connection string",
  );
});

Deno.test("Throws on connection string with invalid ssl mode", function () {
  assertThrows(
    () =>
      createParams(
        "postgres://some_user@some_host:10101/deno_postgres?sslmode=verify-full",
      ),
    ConnectionParamsError,
    "Supplied DSN has invalid sslmode 'verify-full'. Only 'disable', 'require', and 'prefer' are supported",
  );
});

Deno.test("Parses connection options", function () {
  const p = createParams({
    user: "some_user",
    hostname: "some_host",
    port: 10101,
    database: "deno_postgres",
    host_type: "tcp",
  });

  assertEquals(p.database, "deno_postgres");
  assertEquals(p.user, "some_user");
  assertEquals(p.hostname, "some_host");
  assertEquals(p.port, 10101);
});

Deno.test("Throws on invalid tls options", function () {
  assertThrows(
    () =>
      createParams({
        host_type: "tcp",
        tls: {
          enabled: false,
          enforce: true,
        },
      }),
    ConnectionParamsError,
    "Can't enforce TLS when client has TLS encryption is disabled",
  );
});

Deno.test("Parses env connection options", function () {
  withEnv({
    database: "deno_postgres",
    host: "some_host",
    port: "10101",
    user: "some_user",
  }, () => {
    const p = createParams();
    assertEquals(p.database, "deno_postgres");
    assertEquals(p.hostname, "some_host");
    assertEquals(p.port, 10101);
    assertEquals(p.user, "some_user");
  });
});

Deno.test("Throws on env connection options with invalid port", function () {
  const port = "abc";
  withEnv({
    database: "deno_postgres",
    host: "some_host",
    port,
    user: "some_user",
  }, () => {
    assertThrows(
      () => createParams(),
      ConnectionParamsError,
      `"${port}" is not a valid port number`,
    );
  });
});

Deno.test({
  name: "Parses mixed connection options and env connection options",
  fn: () => {
    const p = createParams({
      database: "deno_postgres",
      host_type: "tcp",
      user: "deno_postgres",
    });

    assertEquals(p.database, "deno_postgres");
    assertEquals(p.user, "deno_postgres");
    assertEquals(p.hostname, "127.0.0.1");
    assertEquals(p.port, 5432);
  },
  permissions: {
    env: false,
  },
});

Deno.test({
  name: "Throws if it can't obtain necessary parameters from config or env",
  fn: () => {
    assertThrows(
      () => createParams(),
      ConnectionParamsError,
      "Missing connection parameters: database, user",
    );

    assertThrows(
      () => createParams({ user: "some_user" }),
      ConnectionParamsError,
      "Missing connection parameters: database",
    );
  },
  permissions: {
    env: false,
  },
});

Deno.test({
  name: "Uses default connection options",
  fn: () => {
    const database = "deno_postgres";
    const user = "deno_postgres";

    const p = createParams({
      database,
      host_type: "tcp",
      user,
    });

    assertEquals(p.database, database);
    assertEquals(p.user, user);
    assertEquals(
      p.hostname,
      "127.0.0.1",
    );
    assertEquals(p.port, 5432);
    assertEquals(
      p.password,
      undefined,
    );
  },
  permissions: {
    env: false,
  },
});

Deno.test({
  name: "Throws when required options are not passed",
  fn: () => {
    assertThrows(
      () => createParams(),
      ConnectionParamsError,
      "Missing connection parameters:",
    );
  },
  permissions: {
    env: false,
  },
});

Deno.test("Determines host type", () => {
  {
    const p = createParams({
      database: "some_db",
      hostname: "127.0.0.1",
      user: "some_user",
    });

    assertEquals(p.host_type, "tcp");
  }

  {
    const p = createParams(
      "postgres://somehost.com?dbname=some_db&user=some_user",
    );
    assertEquals(p.hostname, "somehost.com");
    assertEquals(p.host_type, "tcp");
  }

  {
    const abs_path = "/some/absolute/path";

    const p = createParams({
      database: "some_db",
      hostname: abs_path,
      host_type: "socket",
      user: "some_user",
    });

    assertEquals(p.hostname, abs_path);
    assertEquals(p.host_type, "socket");
  }

  {
    const rel_path = "./some_file";

    const p = createParams({
      database: "some_db",
      hostname: rel_path,
      host_type: "socket",
      user: "some_user",
    });

    assertEquals(p.hostname, fromFileUrl(new URL(rel_path, import.meta.url)));
    assertEquals(p.host_type, "socket");
  }

  {
    const p = createParams("postgres://?dbname=some_db&user=some_user");
    assertEquals(p.hostname, "/tmp");
    assertEquals(p.host_type, "socket");
  }
});

Deno.test("Throws when TLS options and socket type are specified", () => {
  assertThrows(
    () =>
      createParams({
        database: "some_db",
        hostname: "./some_file",
        host_type: "socket",
        user: "some_user",
        tls: {
          enabled: true,
        },
      }),
    ConnectionParamsError,
    `No TLS options are allowed when host type is set to "socket"`,
  );
});

Deno.test("Throws when host is a URL and host type is socket", () => {
  assertThrows(
    () =>
      createParams({
        database: "some_db",
        hostname: "https://some_host.com",
        host_type: "socket",
        user: "some_user",
      }),
    (e: unknown) => {
      if (!(e instanceof ConnectionParamsError)) {
        throw new Error(`Unexpected error: ${e}`);
      }

      const expected_message = "The provided host is not a file path";

      if (
        typeof e?.cause?.message !== "string" ||
        !e.cause.message.includes(expected_message)
      ) {
        throw new Error(
          `Expected error message to include "${expected_message}"`,
        );
      }
    },
  );
});
