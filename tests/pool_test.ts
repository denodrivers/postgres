import { assertEquals, delay } from "./test_deps.ts";
import { Pool } from "../pool.ts";
import { getMainConfiguration } from "./config.ts";

function testPool(
  name: string,
  t: (pool: Pool) => void | Promise<void>,
  lazy?: boolean,
) {
  const fn = async () => {
    const POOL = new Pool(getMainConfiguration(), 10, lazy);
    // If the connection is not lazy, create a client to await
    // for initialization
    if (!lazy) {
      const client = await POOL.connect();
      await client.release();
    }
    try {
      await t(POOL);
    } finally {
      await POOL.end();
    }
  };
  Deno.test({ fn, name });
}

testPool(
  "Pool handles simultaneous connections correcly",
  async function (POOL) {
    assertEquals(POOL.available, 10);
    const client = await POOL.connect();
    const p = client.queryArray("SELECT pg_sleep(0.1) is null, -1 AS id");
    await delay(1);
    assertEquals(POOL.available, 9);
    assertEquals(POOL.size, 10);
    await p;
    await client.release();
    assertEquals(POOL.available, 10);

    const qsThunks = [...Array(25)].map(async (_, i) => {
      const client = await POOL.connect();
      const query = await client.queryArray(
        "SELECT pg_sleep(0.1) is null, $1::text as id",
        i,
      );
      await client.release();
      return query;
    });
    const qsPromises = Promise.all(qsThunks);
    await delay(1);
    assertEquals(POOL.available, 0);
    const qs = await qsPromises;
    assertEquals(POOL.available, 10);
    assertEquals(POOL.size, 10);

    const result = qs.map((r) => r.rows[0][1]);
    const expected = [...Array(25)].map((_, i) => i.toString());
    assertEquals(result, expected);
  },
);

testPool(
  "Pool initializes lazy connections on demand",
  async function (POOL) {
    // deno-lint-ignore camelcase
    const client_1 = await POOL.connect();
    await client_1.queryArray("SELECT 1");
    await client_1.release();
    assertEquals(POOL.available, 1);

    // deno-lint-ignore camelcase
    const client_2 = await POOL.connect();
    const p = client_2.queryArray("SELECT pg_sleep(0.1) is null, -1 AS id");
    await delay(1);
    assertEquals(POOL.available, 0);
    assertEquals(POOL.size, 1);
    await p;
    await client_2.release();
    assertEquals(POOL.available, 1);

    const qsThunks = [...Array(25)].map(async (_, i) => {
      const client = await POOL.connect();
      const query = await client.queryArray(
        "SELECT pg_sleep(0.1) is null, $1::text as id",
        i,
      );
      await client.release();
      return query;
    });
    const qsPromises = Promise.all(qsThunks);
    await delay(1);
    assertEquals(POOL.available, 0);
    const qs = await qsPromises;
    assertEquals(POOL.available, 10);
    assertEquals(POOL.size, 10);

    const result = qs.map((r) => r.rows[0][1]);
    const expected = [...Array(25)].map((_, i) => i.toString());
    assertEquals(result, expected);
  },
  true,
);

testPool("Pool can be reinitialized after termination", async function (POOL) {
  await POOL.end();
  assertEquals(POOL.available, 0);

  const client = await POOL.connect();
  await client.queryArray`SELECT 1`;
  await client.release();
  assertEquals(POOL.available, 10);
});

testPool(
  "Lazy pool can be reinitialized after termination",
  async function (POOL) {
    await POOL.end();
    assertEquals(POOL.available, 0);

    const client = await POOL.connect();
    await client.queryArray`SELECT 1`;
    await client.release();
    assertEquals(POOL.available, 1);
  },
  true,
);
