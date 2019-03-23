import { test, assertEquals } from "../deps.ts";
import { encode } from "../encode.ts";

// internally `encode` uses `getTimezoneOffset` to encode Date
// so for testing purposes we'll be overriding it
const _getTimezoneOffset = Date.prototype.getTimezoneOffset;

function resetTimezoneOffset() {
  Date.prototype.getTimezoneOffset = _getTimezoneOffset;
}

function overrideTimezoneOffset(offset: number) {
  Date.prototype.getTimezoneOffset = function() {
    return offset;
  };
}

test(function encodeDatetime() {
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

test(function encodeUndefined() {
  assertEquals(encode(undefined), null);
});

test(function encodeNull() {
  assertEquals(encode(null), null);
});

test(function encodeBoolean() {
  assertEquals(encode(true), "true");
  assertEquals(encode(false), "false");
});

test(function encodeNumber() {
  assertEquals(encode(1), "1");
  assertEquals(encode(1.2345), "1.2345");
});

test(function encodeString() {
  assertEquals(encode("deno-postgres"), "deno-postgres");
});

test(function encodeObject() {
  assertEquals(encode({ x: 1 }), '{"x":1}');
});

test(function encodeUint8Array() {
  const buf = new Uint8Array([1, 2, 3]);
  const encoded = encode(buf);

  assertEquals(buf, encoded);
});

test(function encodeArray() {
  const array = [null, "postgres", 1, ["foo", "bar"]];
  const encodedArray = encode(array);

  assertEquals(encodedArray, '{NULL,"postgres","1",{"foo","bar"}}');
});

test(function encodeObjectArray() {
  const array = [{ x: 1 }, { y: 2 }];
  const encodedArray = encode(array);
  assertEquals(encodedArray, '{"{\\"x\\":1}","{\\"y\\":2}"}');
});

test(function encodeDateArray() {
  overrideTimezoneOffset(0);

  const array = [new Date(2019, 1, 10, 20, 30, 40, 5)];
  const encodedArray = encode(array);
  assertEquals(encodedArray, '{"2019-02-10T20:30:40.005+00:00"}');

  resetTimezoneOffset();
});
