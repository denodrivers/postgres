import { Client } from "../client.ts";
import type { ClientOptions } from "../connection/connection_params.ts";

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
