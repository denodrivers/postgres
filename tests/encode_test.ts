import { assertEquals } from "./test_deps.ts";
import { encode } from "../query/encode.ts";

// internally `encode` uses `getTimezoneOffset` to encode Date
// so for testing purposes we'll be overriding it
const _getTimezoneOffset = Date.prototype.getTimezoneOffset;

function resetTimezoneOffset() {
  Date.prototype.getTimezoneOffset = _getTimezoneOffset;
}

function overrideTimezoneOffset(offset: number) {
  Date.prototype.getTimezoneOffset = function () {
    return offset;
  };
}

Deno.test("encodeDatetime", function () {
  // GMT
  overrideTimezoneOffset(0);

  const gmtDate = new Date(2019, 1, 10, 20, 30, 40, 5);
  const gmtEncoded = encode(gmtDate);
  assertEquals(gmtEncoded, "2019-02-10T20:30:40.005+00:00");

  resetTimezoneOffset();

  // GMT+02:30
  overrideTimezoneOffset(-150);

  const date = new Date(2019, 1, 10, 20, 30, 40, 5);
  const encoded = encode(date);
  assertEquals(encoded, "2019-02-10T20:30:40.005+02:30");

  resetTimezoneOffset();
});

Deno.test("encodeUndefined", function () {
  assertEquals(encode(undefined), null);
});

Deno.test("encodeNull", function () {
  assertEquals(encode(null), null);
});

Deno.test("encodeBoolean", function () {
  assertEquals(encode(true), "true");
  assertEquals(encode(false), "false");
});

Deno.test("encodeNumber", function () {
  assertEquals(encode(1), "1");
  assertEquals(encode(1.2345), "1.2345");
});

Deno.test("encodeString", function () {
  assertEquals(encode("deno-postgres"), "deno-postgres");
});

Deno.test("encodeObject", function () {
  assertEquals(encode({ x: 1 }), '{"x":1}');
});

Deno.test("encodeUint8Array", function () {
  const buf1 = new Uint8Array([1, 2, 3]);
  const buf2 = new Uint8Array([2, 10, 500]);
  const buf3 = new Uint8Array([11]);

  assertEquals("\\x010203", encode(buf1));
  assertEquals("\\x020af4", encode(buf2));
  assertEquals("\\x0b", encode(buf3));
});

Deno.test("encodeArray", function () {
  const array = [null, "postgres", 1, ["foo", "bar"]];
  const encodedArray = encode(array);

  assertEquals(encodedArray, '{NULL,"postgres","1",{"foo","bar"}}');
});

Deno.test("encodeObjectArray", function () {
  const array = [{ x: 1 }, { y: 2 }];
  const encodedArray = encode(array);
  assertEquals(encodedArray, '{"{\\"x\\":1}","{\\"y\\":2}"}');
});

Deno.test("encodeDateArray", function () {
  overrideTimezoneOffset(0);

  const array = [new Date(2019, 1, 10, 20, 30, 40, 5)];
  const encodedArray = encode(array);
  assertEquals(encodedArray, '{"2019-02-10T20:30:40.005+00:00"}');

  resetTimezoneOffset();
});
