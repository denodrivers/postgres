import { assertEquals, delay } from "./test_deps.ts";
import { getMainConfiguration } from "./config.ts";
import { generatePoolClientTest } from "./helpers.ts";

const testPool = generatePoolClientTest(getMainConfiguration());

Deno.test(
  "Pool handles simultaneous connections correcly",
  testPool(
    async (POOL) => {
      assertEquals(POOL.available, 10);
      const client = await POOL.connect();
      const p = client.queryArray("SELECT pg_sleep(0.1) is null, -1 AS id");
      await delay(1);
      assertEquals(POOL.available, 9);
      assertEquals(POOL.size, 10);
      await p;
      client.release();
      assertEquals(POOL.available, 10);

      const qsThunks = [...Array(25)].map(async (_, i) => {
        const client = await POOL.connect();
        const query = await client.queryArray(
          "SELECT pg_sleep(0.1) is null, $1::text as id",
          [i],
        );
        client.release();
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
  ),
);

Deno.test(
  "Pool initializes lazy connections on demand",
  testPool(
    async (POOL, size) => {
      const client_1 = await POOL.connect();
      await client_1.queryArray("SELECT 1");
      await client_1.release();
      assertEquals(await POOL.initialized(), 1);

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
      const requested_clients = size + 5;
      const qsThunks = Array.from(
        { length: requested_clients },
        async (_, i) => {
          const client = await POOL.connect();
          const query = await client.queryArray(
            "SELECT pg_sleep(0.1) is null, $1::text as id",
            [i],
          );
          client.release();
          return query;
        },
      );
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
  ),
);

Deno.test(
  "Pool can be reinitialized after termination",
  testPool(async (POOL) => {
    await POOL.end();
    assertEquals(POOL.available, 0);

    const client = await POOL.connect();
    await client.queryArray`SELECT 1`;
    client.release();
    assertEquals(POOL.available, 10);
  }),
);

Deno.test(
  "Lazy pool can be reinitialized after termination",
  testPool(
    async (POOL, size) => {
      await POOL.end();
      assertEquals(POOL.available, 0);
      assertEquals(await POOL.initialized(), 0);

      const client = await POOL.connect();
      await client.queryArray`SELECT 1`;
      client.release();
      assertEquals(await POOL.initialized(), 1);
      assertEquals(POOL.available, size);
    },
    10,
    true,
  ),
);
