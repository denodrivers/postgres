import { Client } from "../client.ts";
import { Pool } from "../pool.ts";
import { type ClientOptions } from "../connection/connection_params.ts";

export function generateSimpleClientTest(
  client_options: ClientOptions,
) {
  return function testSimpleClient(
    test_function: (client: Client) => Promise<void>,
  ): () => Promise<void> {
    return async () => {
      const client = new Client(client_options);
      try {
        await client.connect();
        await test_function(client);
      } finally {
        await client.end();
      }
    };
  };
}

export function generatePoolClientTest(client_options: ClientOptions) {
  return function generatePoolClientTest1(
    test_function: (pool: Pool, size: number, lazy: boolean) => Promise<void>,
    size = 10,
    lazy = false,
  ) {
    return async () => {
      const pool = new Pool(client_options, size, lazy);
      // If the connection is not lazy, create a client to await
      // for initialization
      if (!lazy) {
        const client = await pool.connect();
        client.release();
      }
      try {
        await test_function(pool, size, lazy);
      } finally {
        await pool.end();
      }
    };
  };
}
