export * from "./deps.ts";
export {
  assert,
  assertEquals,
  assertStrContains,
  assertThrowsAsync
} from "https://deno.land/std@v0.35.0/testing/asserts.ts";

export {
  runTests,
  test,
  TestFunction
} from "https://deno.land/std@v0.35.0/testing/mod.ts";
