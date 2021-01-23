const { test } = Deno;
import { assertEquals, assertThrows } from "../test_deps.ts";
import { ConnectionParamsError, createParams } from "../connection_params.ts";
// deno-lint-ignore camelcase
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
  const PGDATABASE = Deno.env.get("PGDATABASE") || "";
  const PGHOST = Deno.env.get("PGHOST") || "";
  const PGPORT = Deno.env.get("PGPORT") || "";
  const PGUSER = Deno.env.get("PGUSER") || "";

  Deno.env.set("PGDATABASE", env.database);
  Deno.env.set("PGHOST", env.host);
  Deno.env.set("PGPORT", env.port);
  Deno.env.set("PGUSER", env.user);

  fn();

  // Reset to original state
  PGDATABASE
    ? Deno.env.set("PGDATABASE", PGDATABASE)
    : Deno.env.delete("PGDATABASE");
  PGDATABASE ? Deno.env.set("PGHOST", PGHOST) : Deno.env.delete("PGHOST");
  PGDATABASE ? Deno.env.set("PGPORT", PGPORT) : Deno.env.delete("PGPORT");
  PGDATABASE ? Deno.env.set("PGUSER", PGUSER) : Deno.env.delete("PGUSER");
};

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

test("dsnStyleParameters", function () {
  const p = createParams(
    "postgres://some_user@some_host:10101/deno_postgres",
  );

  assertEquals(p.database, "deno_postgres");
  assertEquals(p.user, "some_user");
  assertEquals(p.hostname, "some_host");
  assertEquals(p.port, 10101);
});

test("dsnStyleParametersWithoutExplicitPort", function () {
  const p = createParams(
    "postgres://some_user@some_host/deno_postgres",
  );

  assertEquals(p.database, "deno_postgres");
  assertEquals(p.user, "some_user");
  assertEquals(p.hostname, "some_host");
  assertEquals(p.port, 5432);
});

test("dsnStyleParametersWithApplicationName", function () {
  const p = createParams(
    "postgres://some_user@some_host:10101/deno_postgres?application_name=test_app",
  );

  assertEquals(p.database, "deno_postgres");
  assertEquals(p.user, "some_user");
  assertEquals(p.hostname, "some_host");
  assertEquals(p.applicationName, "test_app");
  assertEquals(p.port, 10101);
});

test("dsnStyleParametersWithInvalidDriver", function () {
  assertThrows(
    () =>
      createParams(
        "somedriver://some_user@some_host:10101/deno_postgres",
      ),
    undefined,
    "Supplied DSN has invalid driver: somedriver.",
  );
});

test("dsnStyleParametersWithInvalidPort", function () {
  assertThrows(
    () =>
      createParams(
        "postgres://some_user@some_host:abc/deno_postgres",
      ),
    undefined,
    "Invalid URL",
  );
});

test("objectStyleParameters", function () {
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

test({
  name: "envParameters",
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

test({
  name: "envParametersWithInvalidPort",
  ignore: !has_env_access,
  fn() {
    withEnv({
      database: "deno_postgres",
      host: "some_host",
      port: "abc",
      user: "some_user",
    }, () => {
      assertThrows(
        () => createParams(),
        ConnectionParamsError,
        "Invalid port NaN",
      );
    });
  },
});

test(
  "envParametersWhenNotAllowed",
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

test("defaultParameters", function () {
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

test("requiredParameters", function () {
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
