import { test, assertEqual } from "../deps.ts";
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
    await client.query("INSERT INTO ids(id) VALUES(1);");
    await client.query("INSERT INTO ids(id) VALUES(2);");

    await client.query("DROP TABLE IF EXISTS timestamps;");
    await client.query("CREATE TABLE timestamps(dt timestamptz);");
    await client.query(`INSERT INTO timestamps(dt) VALUES('2019-02-10T10:30:40.005+04:30');`);
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

    const objectRows = result.rowsOfObjects();
    const row = objectRows[0];

    assertEqual(row.id, 1);
    assertEqual(typeof row.id, "number");
});

test(async function nativeType() {
    const client = await getTestClient();

    const result = await client.query("SELECT * FROM timestamps;");
    const row = result.rows[0];

    const expectedDate = Date.UTC(2019, 1, 10, 6, 0, 40, 5);

    assertEqual(
        row[0].toUTCString(),
        new Date(expectedDate).toUTCString()    
    )

    await client.query('INSERT INTO timestamps(dt) values($1);', new Date());    
});

test(async function tearDown() {
    await testClient.end();
});