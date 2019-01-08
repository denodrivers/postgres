import { Client } from "./main.ts";

async function main() {
    const client = new Client({ user: "portal", database: "portal" });
    await client.connect();
    const res = await client.query('SELECT * from auth_permission LIMIT 1;');
    await client.end();
}

main();
