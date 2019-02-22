import { test, assertEqual } from "../deps.ts";
import { parseDsn, DsnResult } from "../utils.ts";

test(function testParseDsn() {
  let c: DsnResult;

  c = parseDsn(
    "postgres://fizz:buzz@deno.land:8000/test_database?application_name=myapp"
  );

  assertEqual(c.driver, "postgres");
  assertEqual(c.user, "fizz");
  assertEqual(c.password, "buzz");
  assertEqual(c.host, "deno.land");
  assertEqual(c.port, "8000");
  assertEqual(c.database, "test_database");
  assertEqual(c.params.application_name, "myapp");

  c = parseDsn("postgres://deno.land/test_database");

  assertEqual(c.driver, "postgres");
  assertEqual(c.user, "");
  assertEqual(c.password, "");
  assertEqual(c.host, "deno.land");
  assertEqual(c.port, "");
  assertEqual(c.database, "test_database");
});
