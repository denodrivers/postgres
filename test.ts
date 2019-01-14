import { Client } from "./main.ts";

async function main() {
    const client = new Client({ user: "portal", database: "portal" });
    await client.connect();
    try {
        const result = await client.query('SELECT $1::text as message', 'Hello world!');
        console.log(result.rows);
        console.log(result.rowsOfObjects());
    } catch (e) {
        console.log(e);
    }
    
    await client.end();
}

main();
