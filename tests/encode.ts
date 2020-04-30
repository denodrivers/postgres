const { test } = Deno;
import { assertEquals } from "../test_deps.ts";
import { encode } from "../encode.ts";

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

test("encodeDatetime", function () {
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

test("encodeUndefined", function () {
  assertEquals(encode(undefined), null);
});

test("encodeNull", function () {
  assertEquals(encode(null), null);
});

test("encodeBoolean", function () {
  assertEquals(encode(true), "true");
  assertEquals(encode(false), "false");
});

test("encodeNumber", function () {
  assertEquals(encode(1), "1");
  assertEquals(encode(1.2345), "1.2345");
});

test("encodeString", function () {
  assertEquals(encode("deno-postgres"), "deno-postgres");
});

test("encodeObject", function () {
  assertEquals(encode({ x: 1 }), '{"x":1}');
});

test("encodeUint8Array", function () {
  const buf_1 = new Uint8Array([1, 2, 3]);
  const buf_2 = new Uint8Array([2, 10, 500]);

  assertEquals("\\x010203", encode(buf_1));
  assertEquals("\\x02af4", encode(buf_2));
});

test("encodeArray", function () {
  const array = [null, "postgres", 1, ["foo", "bar"]];
  const encodedArray = encode(array);

  assertEquals(encodedArray, '{NULL,"postgres","1",{"foo","bar"}}');
});

test("encodeObjectArray", function () {
  const array = [{ x: 1 }, { y: 2 }];
  const encodedArray = encode(array);
  assertEquals(encodedArray, '{"{\\"x\\":1}","{\\"y\\":2}"}');
});

test("encodeDateArray", function () {
  overrideTimezoneOffset(0);

  const array = [new Date(2019, 1, 10, 20, 30, 40, 5)];
  const encodedArray = encode(array);
  assertEquals(encodedArray, '{"2019-02-10T20:30:40.005+00:00"}');

  resetTimezoneOffset();
});
