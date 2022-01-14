/// <reference no-default-lib="true" />
/// <reference lib="deno.worker" />

const server = Deno.listen({ port: 8080 });

onmessage = ({ data }: { data: "initialize" | "close" }) => {
  switch (data) {
    case "initialize": {
      listenServerConnections();
      postMessage("initialized");
      break;
    }
    case "close": {
      server.close();
      postMessage("closed");
      break;
    }
    default: {
      throw new Error(`Unexpected message "${data}" received on worker`);
    }
  }
};

async function listenServerConnections() {
  for await (const conn of server) {
    // The driver will attempt to check if the server receives
    // a TLS connection, however we return an invalid response
    conn.write(new TextEncoder().encode("INVALID"));
    // Notify the parent thread that we have received a connection
    postMessage("connection");
  }
}

export {};
