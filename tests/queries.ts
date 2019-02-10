import { test, assertEqual } from "https://deno.land/x/std@v0.2.6/testing/mod.ts";
import { Client } from "../mod.ts";

let testClient: Client;

async function getTestClient(): Promise<Client> {
    if (testClient) {
        return testClient;
    }

    testClient = new Client({
        user: "postgres",
        password: "postgres",
        database: "deno_postgres",
        host: "localhost",
        port: "5432",
    });

    await testClient.connect();

    return testClient;
}

// TODO: replace this with "setUp" once it lands in "testing" module
test(async function beforeEach() {
    const client = await getTestClient();

    await client.query("DROP TABLE IF EXISTS ids;");
    await client.query("CREATE TABLE ids(id integer);");
    await client.query("INSERT INTO ids(id) values(1);");
    await client.query("INSERT INTO ids(id) values(2);");

    await client.query("DROP TABLE IF EXISTS timestamps;");
    await client.query("CREATE TABLE timestamps(dt timestamp);");
});


test(async function simpleQuery() {
    const client = await getTestClient();
    
    const result = await client.query('SELECT * FROM ids;');
    assertEqual(result.rows.length, 2);
});


test(async function parametrizedQuery() {
    const client = await getTestClient();

    const result = await client.query('SELECT * FROM ids WHERE id < $1;', 2);
    assertEqual(result.rows.length, 1);
});

// TODO: make this test work - wrong message receiving logic
test(async function nativeType() {
    const client = await getTestClient();

    const result = await client.query('INSERT INTO timestamps(dt) values($1);', new Date());
    console.log(result.rows);
});

test(async function tearDown() {
    await testClient.end();
});