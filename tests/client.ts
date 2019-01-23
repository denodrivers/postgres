import { test, assertEqual } from "https://deno.land/x/std@v0.2.6/testing/mod.ts";
import { Client } from "../mod.ts";


test(async function testDsnStyleParameters() {
    const testClient = new Client("postgres://postgres@localhost:5432/deno_postgres");
    await testClient.connect();
    await testClient.end();
});
