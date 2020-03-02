import { test, TestFunction } from "../test_deps.ts";
import { Client } from "../client.ts";

export function getTestClient(
  client: Client,
  defSetupQueries?: Array<string>
) {
  return async function testClient(
    t: TestFunction,
    setupQueries?: Array<string>
  ) {
    const fn = async () => {
      try {
        await client.connect();
        for (const q of setupQueries || defSetupQueries || []) {
          await client.query(q);
        }
        await t();
      } finally {
        await client.end();
      }
    };
    const name = t.name;
    test({ fn, name });
  };
}
