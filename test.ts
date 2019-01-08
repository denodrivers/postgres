import { Client } from "./main.ts";

async function main() {
    const client = new Client({ user: "portal", database: "portal" });
    await client.connect();
    const result = await client.query('SELECT * from auth_permission LIMIT 1;');
    console.log(result);
    await client.end();
}

main();
