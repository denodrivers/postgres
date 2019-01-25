import { env } from "deno";
import { test, assertEqual } from "https://deno.land/x/std@v0.2.6/testing/mod.ts";
import { Client } from "../mod.ts";


test(async function testDsnStyleParameters() {
    const testClient = new Client("postgres://postgres@localhost:5432/deno_postgres");
    await testClient.connect();
    await testClient.end();
});

test(async function testObjectStyleParameters() {
    const testClient = new Client({
        user: "postgres",
        host: "localhost",
        port: "5432",
        database: "deno_postgres"
    });
    await testClient.connect();
    await testClient.end();
});

test(async function testEnvParamaters() {
    const currentEnv = env();
    
    currentEnv.PGUSER = "postgres";
    currentEnv.PGHOST = "localhost";
    currentEnv.PGPORT = "5432";
    currentEnv.PGDATABASE = "deno_postgres";

    const testClient = new Client();
    await testClient.connect();
    await testClient.end();
});