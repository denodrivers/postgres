import { assertEquals, assertThrows } from "./test_deps.ts";
import { createParams } from "../connection/connection_params.ts";
import { ConnectionParamsError } from "../client/error.ts";
import { has_env_access } from "./constants.ts";

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

// TODO
// Replace with test permission options to remove the need for function override
/**
 * This function will override getting env variables to simulate having no env permissions
 */
function withNotAllowedEnv(fn: () => void) {
  return () => {
    const getEnv = Deno.env.get;

    Deno.env.get = (_key: string) => {
      throw new Deno.errors.PermissionDenied("");
    };

    try {
      fn();
    } finally {
      Deno.env.get = getEnv;
    }
  };
}

Deno.test("Parses connection string", function () {
  const p = createParams(
    "postgres://some_user@some_host:10101/deno_postgres",
  );

  assertEquals(p.database, "deno_postgres");
  assertEquals(p.user, "some_user");
  assertEquals(p.hostname, "some_host");
  assertEquals(p.port, 10101);
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

Deno.test("Parses connection string with sslmode required", function () {
  const p = createParams(
    "postgres://some_user@some_host:10101/deno_postgres?sslmode=require",
  );

  assertEquals(p.tls.enabled, true);
  assertEquals(p.tls.enforce, true);
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
    undefined,
    "Invalid URL",
  );
});

Deno.test("Throws on connection string with invalid ssl mode", function () {
  assertThrows(
    () =>
      createParams(
        "postgres://some_user@some_host:10101/deno_postgres?sslmode=verify-full",
      ),
    undefined,
    "Supplied DSN has invalid sslmode 'verify-full'. Only 'disable', 'require', and 'prefer' are supported",
  );
});

Deno.test("Parses connection options", function () {
  const p = createParams({
    user: "some_user",
    hostname: "some_host",
    port: 10101,
    database: "deno_postgres",
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
        tls: {
          enabled: false,
          enforce: true,
        },
      }),
    ConnectionParamsError,
    "Can't enforce TLS when client has TLS encryption is disabled",
  );
});

Deno.test({
  name: "Parses env connection options",
  ignore: !has_env_access,
  fn() {
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
  },
});

Deno.test({
  name: "Throws on env connection options with invalid port",
  ignore: !has_env_access,
  fn() {
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
  },
});

Deno.test(
  "Parses mixed connection options and env connection options",
  withNotAllowedEnv(function () {
    const p = createParams({
      database: "deno_postgres",
      user: "deno_postgres",
    });

    assertEquals(p.database, "deno_postgres");
    assertEquals(p.user, "deno_postgres");
    assertEquals(p.hostname, "127.0.0.1");
    assertEquals(p.port, 5432);
  }),
);

Deno.test(
  "Throws if it can't obtain necessary parameters from config or env",
  withNotAllowedEnv(function () {
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
  }),
);

Deno.test("Uses default connection options", function () {
  const database = "deno_postgres";
  const user = "deno_postgres";

  const p = createParams({
    database,
    user,
  });

  assertEquals(p.database, database);
  assertEquals(p.user, user);
  assertEquals(
    p.hostname,
    has_env_access ? (Deno.env.get("PGHOST") ?? "127.0.0.1") : "127.0.0.1",
  );
  assertEquals(p.port, 5432);
  assertEquals(
    p.password,
    has_env_access ? Deno.env.get("PGPASSWORD") : undefined,
  );
});

Deno.test("Throws when required options are not passed", function () {
  if (has_env_access) {
    if (!(Deno.env.get("PGUSER") && Deno.env.get("PGDATABASE"))) {
      assertThrows(
        () => createParams(),
        ConnectionParamsError,
        "Missing connection parameters:",
      );
    }
  } else {
    assertThrows(
      () => createParams(),
      ConnectionParamsError,
      "Missing connection parameters: database, user",
    );
  }
});
