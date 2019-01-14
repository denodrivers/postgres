import { Client } from "./main.ts";

async function main() {
    const client = new Client({ user: "portal", database: "portal" });
    await client.connect();
    const result = await client.query('SELECT $1::text as message', 'Hello world!');
    console.log(result.rows);
    console.log(result.rowsOfObjects());
    await client.end();
}

main();
