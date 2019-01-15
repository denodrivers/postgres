import { test, assertEqual } from "https://deno.land/x/std@v0.2.6/testing/mod.ts";
import { Client } from "./main.ts";
import { QueryResult } from "./query.ts";

function getTestClient() {
    return new Client({ 
        user: "postgres", 
        database: "deno_postgres",
    });
}

async function createTestDatabase(client: Client) {
    await client.query("DROP TABLE IF EXISTS ids;");
    await client.query("CREATE TABLE ids(id integer);");
    await client.query("INSERT INTO ids(id) values(1);");
    await client.query("INSERT INTO ids(id) values(2);");
}

test(async function simpleQuery() {
    const client = await getTestClient();
    await client.connect();
    await createTestDatabase(client);

    let result: QueryResult;

    result = await client.query('SELECT * FROM ids;');
    assertEqual(result.rows.length, 2);

    await client.query("INSERT INTO ids(id) values(3);");
    
    result = await client.query('SELECT * FROM ids;');
    assertEqual(result.rows.length, 3);
    
    await client.end();
});