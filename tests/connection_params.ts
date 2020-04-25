const { test } = Deno;
import { assertEquals, assertStrContains } from "../test_deps.ts";
import { ConnectionParams } from "../connection_params.ts";

test(async function dsnStyleParameters() {
  const p = new ConnectionParams(
    "postgres://some_user@some_host:10101/deno_postgres"
  );

  assertEquals(p.database, "deno_postgres");
  assertEquals(p.user, "some_user");
  assertEquals(p.host, "some_host");
  assertEquals(p.port, "10101");
});

test(async function objectStyleParameters() {
  const p = new ConnectionParams({
    user: "some_user",
    host: "some_host",
    port: "10101",
    database: "deno_postgres"
  });

  assertEquals(p.database, "deno_postgres");
  assertEquals(p.user, "some_user");
  assertEquals(p.host, "some_host");
  assertEquals(p.port, "10101");
});

// TODO: add test when env is not allowed
test(async function envParameters() {
  const currentEnv = Deno.env();

  currentEnv.PGUSER = "some_user";
  currentEnv.PGHOST = "some_host";
  currentEnv.PGPORT = "10101";
  currentEnv.PGDATABASE = "deno_postgres";

  const p = new ConnectionParams();
  assertEquals(p.database, "deno_postgres");
  assertEquals(p.user, "some_user");
  assertEquals(p.host, "some_host");
  assertEquals(p.port, "10101");

  // clear out env
  currentEnv.PGUSER = "";
  currentEnv.PGHOST = "";
  currentEnv.PGPORT = "";
  currentEnv.PGDATABASE = "";
});

test(async function defaultParameters() {
  const p = new ConnectionParams({
    database: "deno_postgres",
    user: "deno_postgres"
  });
  assertEquals(p.database, "deno_postgres");
  assertEquals(p.user, "deno_postgres");
  assertEquals(p.host, "127.0.0.1");
  assertEquals(p.port, "5432");
  assertEquals(p.password, undefined);
});

test(async function requiredParameters() {
  let thrown = false;

  try {
    new ConnectionParams();
  } catch (e) {
    thrown = true;
    assertEquals(e.name, "ConnectionParamsError");
    assertStrContains(
      e.message,
      "Missing connection parameters: database, user"
    );
  }
  assertEquals(thrown, true);
});

test(async function certParameters() {
  const certFile = (await Deno.readFile("./tests/cert/RootCA.crt")).toString();
  const p = new ConnectionParams({
    port: "1010",
    host: "some_host",
    database: "deno_postgres",
    user: "deno_postgres",
    cert_file: certFile
  });
  assertEquals(p.cert_file, certFile);
});
