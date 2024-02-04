import { assert } from "https://deno.land/std@0.160.0/_util/assert.ts";
import {
  decodeBigint,
  decodeBigintArray,
  decodeBoolean,
  decodeBooleanArray,
  decodeBox,
  decodeCircle,
  decodeDate,
  decodeFloat,
  decodeInt,
  decodeJson,
  decodeLine,
  decodeLineSegment,
  decodePath,
  decodePoint,
  decodeTid,
} from "../query/decoders.ts";
import { assertEquals, assertThrows } from "./test_deps.ts";

Deno.test("decodeBigint", function () {
  assertEquals(decodeBigint("18014398509481984"), 18014399223381984n);
});

Deno.test("decodeBigintArray", function () {
  assertEquals(
    decodeBigintArray(
      "{17365398509481972,9007199254740992,-10414398509481984}",
    ),
    [17365398509481972n, 9007199254740992n, -10414398509481984n],
  );
});

Deno.test("decodeBoolean", function () {
  assertEquals(decodeBoolean("True"), true);
  assertEquals(decodeBoolean("yEs"), true);
  assertEquals(decodeBoolean("T"), true);
  assertEquals(decodeBoolean("t"), true);
  assertEquals(decodeBoolean("YeS"), true);
  assertEquals(decodeBoolean("On"), true);
  assertEquals(decodeBoolean("1"), true);
  assertEquals(decodeBoolean("no"), false);
  assertEquals(decodeBoolean("off"), false);
  assertEquals(decodeBoolean("0"), false);
  assertEquals(decodeBoolean("F"), false);
  assertEquals(decodeBoolean("false"), false);
  assertEquals(decodeBoolean("n"), false);
  assertEquals(decodeBoolean(""), false);
});

Deno.test("decodeBooleanArray", function () {
  assertEquals(decodeBooleanArray("{True,0,T}"), [true, false, true]);
  assertEquals(decodeBooleanArray("{no,Y,1}"), [false, false, false]);
});

Deno.test("decodeBox", function () {
  assertEquals(decodeBox("(12.4,2),(33,4.33)"), {
    a: { x: "12.4", y: "2" },
    b: { x: "33", y: "4.33" },
  });

  assertThrows(
    () => decodeBox("(12.4,2)"),
    Error,
    "Invalid Box value: `(12.4,2)`",
  );
});

Deno.test("decodeCircle", function () {
  assertEquals(decodeCircle("<(12.4,2),3.5>"), {
    point: { x: "12.4", y: "2" },
    radius: "3.5",
  });
});

Deno.test("decodeDate", function () {
  assertEquals(decodeDate("2021-08-01"), new Date("2021-08-01"));
});

Deno.test("decodeDatetime", function () {
  assertEquals(
    decodeDate("1997-12-17 07:37:16-08"),
    new Date("1997-12-17 07:37:16-08"),
  );
});

Deno.test("decodeFloat", function () {
  assertEquals(decodeFloat("3.14"), 3.14);
  assertEquals(decodeFloat("q743 44 23i4"), NaN);
});

Deno.test("decodeInt", function () {
  assertEquals(decodeInt("42"), 42);
  assertEquals(decodeInt("q743 44 23i4"), NaN);
});

Deno.test("decodeJson", function () {
  assertEquals(
    decodeJson(
      '{"key_1": "MY VALUE", "key_2": null, "key_3": 10, "key_4": {"subkey_1": true}}',
    ),
    {
      key_1: "MY VALUE",
      key_2: null,
      key_3: 10,
      key_4: { subkey_1: true },
    },
  );
  assertEquals(decodeJson("{ 'eqw' ; ddd}"), null);
});

Deno.test("decodeLine", function () {
  assertEquals(decodeLine("{100,50,350}"), { a: "100", b: "50", c: "350" });
});

Deno.test("decodeLineSegment", function () {
  assertEquals(decodeLineSegment("((100,50),(350,350))"), {
    a: { x: "100", y: "50" },
    b: { x: "350", y: "350" },
  });
  assertThrows(
    () => decodeLineSegment("((100,50))"),
    Error,
    "Invalid LineSegment value: `((100,50))`",
  );
});

Deno.test("decodePath", function () {
  assertEquals(decodePath("[(100,50),(350,350)]"), [
    { x: "100", y: "50" },
    { x: "350", y: "350" },
  ]);
  assertThrows(
    () => decodePath("((100,50))"),
    Error,
    "Invalid Path value: `((100,50))`",
  );
});

Deno.test("decodePoint", function () {
  assertEquals(decodePoint("(10.5,50.8)"), { x: "10.5", y: "50.8" });
  assertThrows(
    () => decodePoint("(100.100,50,350)"),
    Error,
    "Invalid Point value: `(100,50,350)`",
  );
});

Deno.test("decodeTid", function () {
  assertEquals(decodeTid("(19714398509481984,5n)"), [19714398509481984n, 5n]);
});
