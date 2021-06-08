import { assertEquals } from "./test_deps.ts";
import { DsnResult, parseDsn } from "../utils/utils.ts";
import { DeferredAccessStack } from "../utils/deferred.ts";

class LazilyInitializedObject {
  initialized = false;

  async initialize(): Promise<void> {
    // Fake delay
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 10);
    });

    this.initialized = true;
  }
}

Deno.test("parseDsn", function () {
  let c: DsnResult;

  c = parseDsn(
    "postgres://fizz:buzz@deno.land:8000/test_database?application_name=myapp",
  );

  assertEquals(c.driver, "postgres");
  assertEquals(c.user, "fizz");
  assertEquals(c.password, "buzz");
  assertEquals(c.hostname, "deno.land");
  assertEquals(c.port, "8000");
  assertEquals(c.database, "test_database");
  assertEquals(c.params.application_name, "myapp");

  c = parseDsn("postgres://deno.land/test_database");

  assertEquals(c.driver, "postgres");
  assertEquals(c.user, "");
  assertEquals(c.password, "");
  assertEquals(c.hostname, "deno.land");
  assertEquals(c.port, "");
  assertEquals(c.database, "test_database");
});

Deno.test("DeferredAccessStack", async () => {
  // deno-lint-ignore camelcase
  const stack_size = 10;

  const stack = new DeferredAccessStack(
    Array.from({ length: stack_size }, () => new LazilyInitializedObject()),
    async (e) => {
      if (!e.initialized) {
        await e.initialize();
      }
    },
  );

  assertEquals(stack.size, stack_size);
  assertEquals(stack.available, stack_size);
  const a = await stack.pop();
  assertEquals(a.initialized, true);
  assertEquals(stack.size, stack_size);
  assertEquals(stack.available, stack_size - 1);
  stack.push(a);
  assertEquals(stack.size, stack_size);
  assertEquals(stack.available, stack_size);
});

Deno.test("An empty DeferredAccessStack awaits until an object is back in the stack", async () => {
  // deno-lint-ignore camelcase
  const stack_size = 1;

  const stack = new DeferredAccessStack(
    Array.from({ length: stack_size }, () => new LazilyInitializedObject()),
    async (e) => {
      if (!e.initialized) {
        await e.initialize();
      }
    },
  );

  const a = await stack.pop();
  let fulfilled = false;
  const b = stack.pop()
    .then((e) => {
      fulfilled = true;
      return e;
    });

  await new Promise((r) => setTimeout(r, 100));
  assertEquals(fulfilled, false);

  stack.push(a);
  assertEquals(a, await b);
  assertEquals(fulfilled, true);
});
