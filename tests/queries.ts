import { test, assertEqual } from "https://deno.land/x/std@v0.2.6/testing/mod.ts";
import { Client } from "../mod.ts";
import { QueryResult } from "../query.ts";

let testClient: Client;

async function getTestClient(): Promise<Client> {
    if (testClient) {
        return testClient;
    }

    testClient = new Client({
        user: "postgres",
        database: "deno_postgres",
    });
    await testClient.connect();

    return testClient;
}

// TODO: replace this with "setUp" once it lands in "testing" module
test(async function beforeEach() {
    console.log('setup');
    const client = await getTestClient();

    await client.query("DROP TABLE IF EXISTS ids;");
    await client.query("CREATE TABLE ids(id integer);");
    await client.query("INSERT INTO ids(id) values(1);");
    await client.query("INSERT INTO ids(id) values(2);");
    console.log("setup done");
});


test(async function simpleQuery() {
    console.log('simple query');
    const client = await getTestClient();
    
    const result = await client.query('SELECT * FROM ids;');
    assertEqual(result.rows.length, 2);
});


test(async function parametrizedQuery() {
    console.log('parametrized');
    const client = await getTestClient();

    const result = await client.query('SELECT * FROM ids WHERE id < $1;', "2");
    assertEqual(result.rows.length, 1);
});

test(async function tearDown() {
    await testClient.end();
});