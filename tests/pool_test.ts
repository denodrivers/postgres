import { assertEquals, delay } from "./test_deps.ts";
import { Pool } from "../pool.ts";
import { getMainConfiguration } from "./config.ts";

function testPool(
  name: string,
  t: (pool: Pool, size: number, lazy: boolean) => void | Promise<void>,
  size = 10,
  lazy = false,
) {
  const fn = async () => {
    const POOL = new Pool(getMainConfiguration(), size, lazy);
    // If the connection is not lazy, create a client to await
    // for initialization
    if (!lazy) {
      const client = await POOL.connect();
      await client.release();
    }
    try {
      await t(POOL, size, lazy);
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
  async function (POOL, size) {
    // deno-lint-ignore camelcase
    const client_1 = await POOL.connect();
    await client_1.queryArray("SELECT 1");
    await client_1.release();
    assertEquals(await POOL.initialized(), 1);

    // deno-lint-ignore camelcase
    const client_2 = await POOL.connect();
    const p = client_2.queryArray("SELECT pg_sleep(0.1) is null, -1 AS id");
    await delay(1);
    assertEquals(POOL.size, size);
    assertEquals(POOL.available, size - 1);
    assertEquals(await POOL.initialized(), 0);
    await p;
    await client_2.release();
    assertEquals(await POOL.initialized(), 1);

    // Test stack repletion as well
    // deno-lint-ignore camelcase
    const requested_clients = size + 5;
    const qsThunks = Array.from({ length: requested_clients }, async (_, i) => {
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
    assertEquals(await POOL.initialized(), 0);
    const qs = await qsPromises;
    assertEquals(POOL.available, size);
    assertEquals(await POOL.initialized(), size);

    const result = qs.map((r) => r.rows[0][1]);
    const expected = Array.from(
      { length: requested_clients },
      (_, i) => i.toString(),
    );
    assertEquals(result, expected);
  },
  10,
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
  async function (POOL, size) {
    await POOL.end();
    assertEquals(POOL.available, 0);
    assertEquals(await POOL.initialized(), 0);

    const client = await POOL.connect();
    await client.queryArray`SELECT 1`;
    await client.release();
    assertEquals(await POOL.initialized(), 1);
    assertEquals(POOL.available, size);
  },
  10,
  true,
);
