import { test, TestFunction } from "../deps.ts";

export function getTestClient(client, defSetupQueries) {
  return async function testClient(
    t: TestFunction,
    setupQueries?: Array<string>
  ) {
    const fn = async () => {
      try {
        await client.connect();
        for (const q of setupQueries || defSetupQueries) {
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
