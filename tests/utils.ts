const { test } = Deno;
import { assertEquals } from "../test_deps.ts";
import { parseDsn, DsnResult } from "../utils.ts";

test("testParseDsn", function () {
  let c: DsnResult;

  c = parseDsn(
    "postgres://fizz:buzz@deno.land:8000/test_database?application_name=myapp",
  );

  assertEquals(c.driver, "postgres");
  assertEquals(c.user, "fizz");
  assertEquals(c.password, "buzz");
  assertEquals(c.hostname, "deno.land");
  assertEquals(c.port, "8000");
  assertEquals(c.database, "test_database");
  assertEquals(c.params.application_name, "myapp");

  c = parseDsn("postgres://deno.land/test_database");

  assertEquals(c.driver, "postgres");
  assertEquals(c.user, "");
  assertEquals(c.password, "");
  assertEquals(c.hostname, "deno.land");
  assertEquals(c.port, "");
  assertEquals(c.database, "test_database");
});
