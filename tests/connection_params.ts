import { env } from "deno";
import { test, assertEqual } from "../deps.ts";
import { ConnectionParams } from "../connection_params.ts";


test(async function testDsnStyleParameters() {
    const p = new ConnectionParams("postgres://some_user@some_host:10101/deno_postgres");
    
    assertEqual(p.database, "deno_postgres");
    assertEqual(p.user, "some_user");
    assertEqual(p.host, "some_host");
    assertEqual(p.port, "10101");
});

test(async function testObjectStyleParameters() {
    const p = new ConnectionParams({
        user: "some_user",
        host: "some_host",
        port: "10101",
        database: "deno_postgres"
    });
    
    assertEqual(p.database, "deno_postgres");
    assertEqual(p.user, "some_user");
    assertEqual(p.host, "some_host");
    assertEqual(p.port, "10101");
});

test(async function testEnvParameters() {
    const currentEnv = env();

    currentEnv.PGUSER = "some_user";
    currentEnv.PGHOST = "some_host";
    currentEnv.PGPORT = "10101";
    currentEnv.PGDATABASE = "deno_postgres";

    const p = new ConnectionParams();
    assertEqual(p.database, "deno_postgres");
    assertEqual(p.user, "some_user");
    assertEqual(p.host, "some_host");
    assertEqual(p.port, "10101");
});