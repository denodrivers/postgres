const { test } = Deno;
import { assertEquals, assertThrows } from "../test_deps.ts";
import { ConnectionParamsError, createParams } from "../connection_params.ts";

// deno-lint-ignore camelcase
let has_env_access = true;
try {
  Deno.env.toObject();
} catch (e) {
  if (e instanceof Deno.errors.PermissionDenied) {
    has_env_access = false;
  } else {
    throw e;
  }
}

function withEnv(obj: Record<string, string>, fn: () => void) {
  return () => {
    const getEnv = Deno.env.get;

    Deno.env.get = (key: string) => {
      return obj[key] || getEnv(key);
    };

    try {
      fn();
    } finally {
      Deno.env.get = getEnv;
    }
  };
}

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

test(
  "envParameters",
  withEnv({
    PGUSER: "some_user",
    PGHOST: "some_host",
    PGPORT: "10101",
    PGDATABASE: "deno_postgres",
  }, function () {
    const p = createParams();
    assertEquals(p.database, "deno_postgres");
    assertEquals(p.user, "some_user");
    assertEquals(p.hostname, "some_host");
    assertEquals(p.port, 10101);
  }),
);

test(
  "envParametersWithInvalidPort",
  withEnv({
    PGUSER: "some_user",
    PGHOST: "some_host",
    PGPORT: "abc",
    PGDATABASE: "deno_postgres",
  }, function () {
    const error = assertThrows(
      () => createParams(),
      undefined,
      "Invalid port NaN",
    );
    assertEquals(error.name, "ConnectionParamsError");
  }),
);

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
    if (!(Deno.env.get("PGUSER") && Deno.env.get("PGPASSWORD"))) {
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
