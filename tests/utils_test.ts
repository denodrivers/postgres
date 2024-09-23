import { assertEquals, assertThrows } from "./test_deps.ts";
import { parseConnectionUri, type Uri } from "../utils/utils.ts";
import { DeferredAccessStack, DeferredStack } from "../utils/deferred.ts";

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

const dns_examples: Partial<Uri>[] = [
  { driver: "postgresql", host: "localhost" },
  { driver: "postgresql", host: "localhost", port: "5433" },
  { driver: "postgresql", host: "localhost", port: "5433", path: "mydb" },
  { driver: "postgresql", host: "localhost", path: "mydb" },
  { driver: "postgresql", host: "localhost", user: "user" },
  { driver: "postgresql", host: "localhost", password: "secret" },
  { driver: "postgresql", host: "localhost", user: "user", password: "secret" },
  {
    driver: "postgresql",
    host: "localhost",
    user: "user",
    password: "secret",
    params: { "param_1": "a" },
  },
  {
    driver: "postgresql",
    host: "localhost",
    user: "user",
    password: "secret",
    path: "otherdb",
    params: { "param_1": "a" },
  },
  {
    driver: "postgresql",
    path: "otherdb",
    params: { "param_1": "a" },
  },
  {
    driver: "postgresql",
    host: "[2001:db8::1234]",
  },
  {
    driver: "postgresql",
    host: "[2001:db8::1234]",
    port: "1500",
  },
  {
    driver: "postgresql",
    host: "[2001:db8::1234]",
    port: "1500",
    params: { "param_1": "a" },
  },
];

Deno.test("Parses connection string into config", async function (context) {
  for (
    const {
      driver,
      user = "",
      host = "",
      params = {},
      password = "",
      path = "",
      port = "",
    } of dns_examples
  ) {
    const url_params = new URLSearchParams();
    for (const key in params) {
      url_params.set(key, params[key]);
    }

    const dirty_dns =
      `${driver}://${user}:${password}@${host}:${port}/${path}?${url_params.toString()}`;

    await context.step(dirty_dns, () => {
      const parsed_dirty_dsn = parseConnectionUri(dirty_dns);

      assertEquals(parsed_dirty_dsn.driver, driver);
      assertEquals(parsed_dirty_dsn.host, host);
      assertEquals(parsed_dirty_dsn.params, params);
      assertEquals(parsed_dirty_dsn.password, password);
      assertEquals(parsed_dirty_dsn.path, path);
      assertEquals(parsed_dirty_dsn.port, port);
      assertEquals(parsed_dirty_dsn.user, user);
    });

    // Build the URL without leaving placeholders
    let clean_dns_string = `${driver}://`;
    if (user || password) {
      clean_dns_string += `${user ?? ""}${password ? `:${password}` : ""}@`;
    }
    if (host || port) {
      clean_dns_string += `${host ?? ""}${port ? `:${port}` : ""}`;
    }
    if (path) {
      clean_dns_string += `/${path}`;
    }
    if (Object.keys(params).length > 0) {
      clean_dns_string += `?${url_params.toString()}`;
    }

    await context.step(clean_dns_string, () => {
      const parsed_clean_dsn = parseConnectionUri(clean_dns_string);

      assertEquals(parsed_clean_dsn.driver, driver);
      assertEquals(parsed_clean_dsn.host, host);
      assertEquals(parsed_clean_dsn.params, params);
      assertEquals(parsed_clean_dsn.password, password);
      assertEquals(parsed_clean_dsn.path, path);
      assertEquals(parsed_clean_dsn.port, port);
      assertEquals(parsed_clean_dsn.user, user);
    });
  }
});

Deno.test("Throws on invalid parameters", () => {
  assertThrows(
    () => parseConnectionUri("postgres://some_host:invalid"),
    Error,
    `The provided port "invalid" is not a valid number`,
  );
});

Deno.test("Parses connection string params into param object", function () {
  const params = {
    param_1: "asd",
    param_2: "xyz",
    param_3: "3541",
  };

  const base_url = new URL("postgres://fizz:buzz@deno.land:8000/test_database");
  for (const [key, value] of Object.entries(params)) {
    base_url.searchParams.set(key, value);
  }

  const parsed_dsn = parseConnectionUri(base_url.toString());

  assertEquals(parsed_dsn.params, params);
});

const encoded_hosts = ["/var/user/postgres", "./some_other_route"];
const encoded_passwords = ["Mtx=", "pássword!=?with_symbols"];

Deno.test("Decodes connection string values correctly", async (context) => {
  await context.step("Host", () => {
    for (const host of encoded_hosts) {
      assertEquals(
        parseConnectionUri(
          `postgres://${encodeURIComponent(host)}:9999/txdb`,
        ).host,
        host,
      );
    }
  });

  await context.step("Password", () => {
    for (const pwd of encoded_passwords) {
      assertEquals(
        parseConnectionUri(
          `postgres://root:${encodeURIComponent(pwd)}@localhost:9999/txdb`,
        ).password,
        pwd,
      );
    }
  });
});

const invalid_hosts = ["Mtx%3", "%E0%A4%A.socket"];
const invalid_passwords = ["Mtx%3", "%E0%A4%A"];

Deno.test("Defaults to connection string literal if decoding fails", async (context) => {
  await context.step("Host", () => {
    for (const host of invalid_hosts) {
      assertEquals(
        parseConnectionUri(
          `postgres://${host}`,
        ).host,
        host,
      );
    }
  });

  await context.step("Password", () => {
    for (const pwd of invalid_passwords) {
      assertEquals(
        parseConnectionUri(
          `postgres://root:${pwd}@localhost:9999/txdb`,
        ).password,
        pwd,
      );
    }
  });
});

Deno.test("DeferredStack", async () => {
  const stack = new DeferredStack<undefined>(
    10,
    [],
    () => new Promise((r) => r(undefined)),
  );

  assertEquals(stack.size, 0);
  assertEquals(stack.available, 0);

  const item = await stack.pop();
  assertEquals(stack.size, 1);
  assertEquals(stack.available, 0);

  stack.push(item);
  assertEquals(stack.size, 1);
  assertEquals(stack.available, 1);
});

Deno.test("An empty DeferredStack awaits until an object is back in the stack", async () => {
  const stack = new DeferredStack<undefined>(
    1,
    [],
    () => new Promise((r) => r(undefined)),
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
