import type { Client } from "../client.ts";

export function getTestClient(
  client: Client,
) {
  return function testClient(
    t: Deno.TestDefinition["fn"],
  ) {
    const fn = async () => {
      try {
        await client.connect();
        await t();
      } finally {
        await client.end();
      }
    };
    const name = t.name;
    Deno.test({ fn, name });
  };
}
