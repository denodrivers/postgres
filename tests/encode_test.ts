import { assertEquals } from "@std/assert";
import { encodeArgument } from "../query/encode.ts";

// internally `encodeArguments` uses `getTimezoneOffset` to encode Date
// so for testing purposes we'll be overriding it
const _getTimezoneOffset = Date.prototype.getTimezoneOffset;

function resetTimezoneOffset() {
  Date.prototype.getTimezoneOffset = _getTimezoneOffset;
}

function overrideTimezoneOffset(offset: number) {
  Date.prototype.getTimezoneOffset = () => {
    return offset;
  };
}

Deno.test("encodeDatetime", () => {
  // GMT
  overrideTimezoneOffset(0);

  const gmtDate = new Date(2019, 1, 10, 20, 30, 40, 5);
  const gmtEncoded = encodeArgument(gmtDate);
  assertEquals(gmtEncoded, "2019-02-10T20:30:40.005+00:00");

  resetTimezoneOffset();

  // GMT+02:30
  overrideTimezoneOffset(-150);

  const date = new Date(2019, 1, 10, 20, 30, 40, 5);
  const encoded = encodeArgument(date);
  assertEquals(encoded, "2019-02-10T20:30:40.005+02:30");

  resetTimezoneOffset();
});

Deno.test("encodeUndefined", () => {
  assertEquals(encodeArgument(undefined), null);
});

Deno.test("encodeNull", () => {
  assertEquals(encodeArgument(null), null);
});

Deno.test("encodeBoolean", () => {
  assertEquals(encodeArgument(true), "true");
  assertEquals(encodeArgument(false), "false");
});

Deno.test("encodeNumber", () => {
  assertEquals(encodeArgument(1), "1");
  assertEquals(encodeArgument(1.2345), "1.2345");
});

Deno.test("encodeString", () => {
  assertEquals(encodeArgument("deno-postgres"), "deno-postgres");
});

Deno.test("encodeObject", () => {
  assertEquals(encodeArgument({ x: 1 }), '{"x":1}');
});

Deno.test("encodeUint8Array", () => {
  const buf1 = new Uint8Array([1, 2, 3]);
  const buf2 = new Uint8Array([2, 10, 500]);
  const buf3 = new Uint8Array([11]);

  assertEquals("\\x010203", encodeArgument(buf1));
  assertEquals("\\x020af4", encodeArgument(buf2));
  assertEquals("\\x0b", encodeArgument(buf3));
});

Deno.test("encodeArray", () => {
  const array = [null, "postgres", 1, ["foo", "bar"]];
  const encodedArray = encodeArgument(array);

  assertEquals(encodedArray, '{NULL,"postgres","1",{"foo","bar"}}');
});

Deno.test("encodeObjectArray", () => {
  const array = [{ x: 1 }, { y: 2 }];
  const encodedArray = encodeArgument(array);
  assertEquals(encodedArray, '{"{\\"x\\":1}","{\\"y\\":2}"}');
});

Deno.test("encodeDateArray", () => {
  overrideTimezoneOffset(0);

  const array = [new Date(2019, 1, 10, 20, 30, 40, 5)];
  const encodedArray = encodeArgument(array);
  assertEquals(encodedArray, '{"2019-02-10T20:30:40.005+00:00"}');

  resetTimezoneOffset();
});
