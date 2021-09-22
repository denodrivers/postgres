import { assertEquals } from "./test_deps.ts";
import { DsnResult, parseDsn } from "../utils/utils.ts";
import { DeferredAccessStack } from "../utils/deferred.ts";

class LazilyInitializedObject {
  #initialized = false;

  // Simulate async check
  get initialized() {
    return new Promise<boolean>((r) => r(this.#initialized));
  }

  async initialize(): Promise<void> {
    // Fake delay
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 10);
    });

    this.#initialized = true;
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

  c = parseDsn("postgres:////root:Mtx=@loalhost:9999/txdb");
  assertEquals(c.user, "root");
  assertEquals(c.password, "Mtx=");

  c = parseDsn("postgres:////root:Mtx%3@loalhost:9999/txdb");
  assertEquals(c.user, "root");
  assertEquals(c.password, "Mtx%3");
});

Deno.test("DeferredAccessStack", async () => {
  const stack_size = 10;

  const stack = new DeferredAccessStack(
    Array.from({ length: stack_size }, () => new LazilyInitializedObject()),
    (e) => e.initialize(),
    (e) => e.initialized,
  );

  assertEquals(stack.size, stack_size);
  assertEquals(stack.available, stack_size);
  assertEquals(await stack.initialized(), 0);

  const a = await stack.pop();
  assertEquals(await a.initialized, true);
  assertEquals(stack.size, stack_size);
  assertEquals(stack.available, stack_size - 1);
  assertEquals(await stack.initialized(), 0);

  stack.push(a);
  assertEquals(stack.size, stack_size);
  assertEquals(stack.available, stack_size);
  assertEquals(await stack.initialized(), 1);
});

Deno.test("An empty DeferredAccessStack awaits until an object is back in the stack", async () => {
  const stack_size = 1;

  const stack = new DeferredAccessStack(
    Array.from({ length: stack_size }, () => new LazilyInitializedObject()),
    (e) => e.initialize(),
    (e) => e.initialized,
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
