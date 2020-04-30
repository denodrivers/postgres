const { test } = Deno;
import { assertEquals, assertStrContains } from "../test_deps.ts";
import { ConnectionParams } from "../connection_params.ts";

test("dsnStyleParameters", async function () {
  const p = new ConnectionParams(
    "postgres://some_user@some_host:10101/deno_postgres",
  );

  assertEquals(p.database, "deno_postgres");
  assertEquals(p.user, "some_user");
  assertEquals(p.host, "some_host");
  assertEquals(p.port, "10101");
});

test("objectStyleParameters", async function () {
  const p = new ConnectionParams({
    user: "some_user",
    host: "some_host",
    port: "10101",
    database: "deno_postgres",
  });

  assertEquals(p.database, "deno_postgres");
  assertEquals(p.user, "some_user");
  assertEquals(p.host, "some_host");
  assertEquals(p.port, "10101");
});

// TODO: add test when env is not allowed
test("envParameters", async function () {
  const currentEnv = Deno.env;

  currentEnv.set("PGUSER", "some_user");
  currentEnv.set("PGHOST", "some_host");
  currentEnv.set("PGPORT", "10101");
  currentEnv.set("PGDATABASE", "deno_postgres");

  const p = new ConnectionParams();
  assertEquals(p.database, "deno_postgres");
  assertEquals(p.user, "some_user");
  assertEquals(p.host, "some_host");
  assertEquals(p.port, "10101");

  // clear out env
  currentEnv.set("PGUSER", "");
  currentEnv.set("PGHOST", "");
  currentEnv.set("PGPORT", "");
  currentEnv.set("PGDATABASE", "");
});

test("defaultParameters", async function () {
  const p = new ConnectionParams({
    database: "deno_postgres",
    user: "deno_postgres",
  });
  assertEquals(p.database, "deno_postgres");
  assertEquals(p.user, "deno_postgres");
  assertEquals(p.host, "127.0.0.1");
  assertEquals(p.port, "5432");
  assertEquals(p.password, undefined);
});

test("requiredParameters", async function () {
  let thrown = false;

  try {
    new ConnectionParams();
  } catch (e) {
    thrown = true;
    assertEquals(e.name, "ConnectionParamsError");
    assertStrContains(
      e.message,
      "Missing connection parameters: database, user",
    );
  }
  assertEquals(thrown, true);
});
