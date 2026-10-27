import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.10";
import { getMainConfiguration } from "./config.ts";
import { Client, type Notification } from "../mod.ts";

/**
 * Runs the test with two connected clients: one that listens and one that
 * sends the notifications
 */
function withClients(
  t: (listener: Client, notifier: Client) => Promise<void>,
) {
  return async () => {
    const listener = new Client(getMainConfiguration());
    const notifier = new Client(getMainConfiguration());
    try {
      await listener.connect();
      await notifier.connect();
      await t(listener, notifier);
    } finally {
      await listener.end();
      await notifier.end();
    }
  };
}

/**
 * Collects the notifications received by a listener and allows waiting for
 * a given amount of them
 */
function collector() {
  const received: Notification[] = [];
  let waiting: { count: number; resolve: () => void } | undefined;
  return {
    received,
    callback(notification: Notification) {
      received.push(notification);
      if (waiting && received.length >= waiting.count) {
        waiting.resolve();
        waiting = undefined;
      }
    },
    async wait(count: number, timeout = 5000) {
      if (received.length >= count) return;
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              `Expected ${count} notifications, got ${received.length}`,
            ),
          ),
        timeout,
      );
      waiting = { count, resolve };
      try {
        await promise;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

Deno.test(
  "A notification received while a client is idle doesn't break the following simple query",
  withClients(async (listener, notifier) => {
    await listener.queryArray("LISTEN raw_channel");
    await notifier.queryArray("SELECT PG_NOTIFY('raw_channel', 'payload')");
    // Give the server time to push the message into the listener socket
    await new Promise((resolve) => setTimeout(resolve, 100));

    const { rows: first } = await listener.queryArray("SELECT 1");
    assertEquals(first, [[1]]);
    const { rows: second } = await listener.queryArray("SELECT 2");
    assertEquals(second, [[2]]);
  }),
);

Deno.test(
  "A notification received while a client is idle doesn't break the following prepared query",
  withClients(async (listener, notifier) => {
    await listener.queryArray("LISTEN raw_channel");
    await notifier.queryArray("SELECT PG_NOTIFY('raw_channel', 'payload')");
    await new Promise((resolve) => setTimeout(resolve, 100));

    const { rows: first } = await listener.queryArray("SELECT $1::INT", [1]);
    assertEquals(first, [[1]]);
    const { rows: second } = await listener.queryArray("SELECT $1::INT", [2]);
    assertEquals(second, [[2]]);
  }),
);

Deno.test(
  "Listen receives notifications while the client is idle",
  withClients(async (listener, notifier) => {
    const notifications = collector();
    await listener.listen("idle_channel", notifications.callback);

    await notifier.queryArray("NOTIFY idle_channel, 'first'");
    await notifier.queryArray("SELECT PG_NOTIFY('idle_channel', 'second')");
    await notifications.wait(2);

    assertEquals(
      notifications.received.map(({ channel, payload }) => ({
        channel,
        payload,
      })),
      [
        { channel: "idle_channel", payload: "first" },
        { channel: "idle_channel", payload: "second" },
      ],
    );
    assertEquals(notifications.received[0].processId, notifier.session.pid);

    // The connection is still usable after receiving notifications
    const { rows } = await listener.queryArray("SELECT 1");
    assertEquals(rows, [[1]]);
  }),
);

Deno.test(
  "A notification received during a query doesn't alter its result",
  withClients(async (listener, notifier) => {
    const notifications = collector();
    await listener.listen("busy_channel", notifications.callback);

    const query = listener.queryArray<[string, number]>(
      "SELECT PG_SLEEP(0.5)::TEXT, 1",
    );
    // The notification is sent while the listener is executing the query
    await new Promise((resolve) => setTimeout(resolve, 100));
    await notifier.queryArray("SELECT PG_NOTIFY('busy_channel', 'busy')");

    const { rows } = await query;
    assertEquals(rows, [["", 1]]);

    const { rows: prepared } = await listener.queryArray(
      "SELECT $1::INT",
      [2],
    );
    assertEquals(prepared, [[2]]);

    await notifications.wait(1);
    assertEquals(notifications.received[0].payload, "busy");
  }),
);

Deno.test(
  "Notifications are delivered for each channel and listener",
  withClients(async (listener, notifier) => {
    const a = collector();
    const b = collector();
    const c = collector();
    await listener.listen("channel_a", a.callback);
    await listener.listen("channel_a", b.callback);
    await listener.listen("channel_b", c.callback);

    await notifier.queryArray("SELECT PG_NOTIFY('channel_a', 'to a')");
    await notifier.queryArray("SELECT PG_NOTIFY('channel_b', 'to b')");
    await a.wait(1);
    await b.wait(1);
    await c.wait(1);

    assertEquals(a.received.map((n) => n.payload), ["to a"]);
    assertEquals(b.received.map((n) => n.payload), ["to a"]);
    assertEquals(c.received.map((n) => n.payload), ["to b"]);
  }),
);

Deno.test(
  "Unlisten stops the delivery of notifications",
  withClients(async (listener, notifier) => {
    const removed = collector();
    const kept = collector();
    const sentinel = collector();
    await listener.listen("unlisten_channel", removed.callback);
    await listener.listen("unlisten_channel", kept.callback);
    await listener.listen("other_channel", sentinel.callback);

    // Removing a single listener keeps the rest subscribed
    await listener.unlisten("unlisten_channel", removed.callback);
    await notifier.queryArray("SELECT PG_NOTIFY('unlisten_channel', '1')");
    await kept.wait(1);

    // Removing all listeners of a channel unsubscribes from it
    await listener.unlisten("unlisten_channel");
    await notifier.queryArray("SELECT PG_NOTIFY('unlisten_channel', '2')");
    // Notifications from a single session are delivered in order, so once the
    // sentinel is received the previous notification would have been too
    await notifier.queryArray("SELECT PG_NOTIFY('other_channel', 'done')");
    await sentinel.wait(1);

    assertEquals(removed.received, []);
    assertEquals(kept.received.map((n) => n.payload), ["1"]);

    const { rows } = await listener.queryArray<[string]>(
      "SELECT * FROM PG_LISTENING_CHANNELS()",
    );
    assertEquals(rows, [["other_channel"]]);
  }),
);

Deno.test(
  "Channel names are used literally and payloads are decoded",
  withClients(async (listener, notifier) => {
    const channel = 'Weird "channel"; ñ';
    const notifications = collector();
    await listener.listen(channel, notifications.callback);

    await notifier.queryArray("SELECT PG_NOTIFY($1, $2)", [
      channel,
      "ñandú 🦕",
    ]);
    await notifier.queryArray("SELECT PG_NOTIFY($1, NULL)", [channel]);
    await notifications.wait(2);

    assertEquals(notifications.received.map((n) => n.channel), [
      channel,
      channel,
    ]);
    assertEquals(notifications.received.map((n) => n.payload), [
      "ñandú 🦕",
      "",
    ]);

    await assertRejects(
      () => listener.listen("", () => {}),
      Error,
      "Channel name must be a non-empty string",
    );
  }),
);

Deno.test(
  "Notifications sent in a transaction are only delivered after commit",
  withClients(async (listener, notifier) => {
    const notifications = collector();
    await listener.listen("transaction_channel", notifications.callback);

    const transaction = notifier.createTransaction("notify_transaction");
    await transaction.begin();
    await transaction.queryArray(
      "SELECT PG_NOTIFY('transaction_channel', 'committed')",
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    assertEquals(notifications.received, []);

    await transaction.commit();
    await notifications.wait(1);
    assertEquals(notifications.received.map((n) => n.payload), ["committed"]);
  }),
);

Deno.test(
  "Listen can't be used while a transaction is in progress",
  withClients(async (listener) => {
    const transaction = listener.createTransaction("listen_transaction");
    await transaction.begin();
    await assertRejects(
      () => listener.listen("locked_channel", () => {}),
      Error,
      'This connection is currently locked by the "listen_transaction" transaction',
    );
    await transaction.commit();
  }),
);

Deno.test(
  "Listeners are subscribed again after reconnection",
  withClients(async (listener, notifier) => {
    const notifications = collector();
    await listener.listen("reconnect_channel", notifications.callback);

    const pid = listener.session.pid;
    await notifier.queryArray("SELECT PG_TERMINATE_BACKEND($1)", [pid]);
    // Wait for the idle reader to notice the connection was closed
    for (let i = 0; i < 50 && listener.connected; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assertEquals(listener.connected, false);

    // The next query reconnects the client and restores the subscriptions
    await listener.queryArray("SELECT 1");
    await notifier.queryArray("SELECT PG_NOTIFY('reconnect_channel', 'back')");
    await notifications.wait(1);
    assertEquals(notifications.received.map((n) => n.payload), ["back"]);
  }),
);

Deno.test(
  "Ending a client stops listening",
  withClients(async (listener, notifier) => {
    const notifications = collector();
    await listener.listen("end_channel", notifications.callback);
    await listener.end();

    // Reconnecting doesn't restore the subscriptions of an ended client
    await listener.connect();
    const { rows } = await listener.queryArray(
      "SELECT * FROM PG_LISTENING_CHANNELS()",
    );
    assertEquals(rows, []);
    await notifier.queryArray("SELECT PG_NOTIFY('end_channel', 'gone')");
  }),
);
