import type { Client } from "../client.ts";

export function getTestClient(
  client: Client,
  defSetupQueries?: Array<string>,
) {
  return function testClient(
    t: Deno.TestDefinition["fn"],
    setupQueries?: Array<string>,
  ) {
    const fn = async () => {
      try {
        await client.connect();
        for (const q of setupQueries || defSetupQueries || []) {
          await client.queryArray(q);
        }
        await t();
      } finally {
        await client.end();
      }
    };
    const name = t.name;
    Deno.test({ fn, name });
  };
}
