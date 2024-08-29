import { assertEquals, assertThrows } from "@std/assert";
import { Column, decode } from "../query/decode.ts";
import {
  decodeBigint,
  decodeBigintArray,
  decodeBoolean,
  decodeBooleanArray,
  decodeBox,
  decodeCircle,
  decodeDate,
  decodeDatetime,
  decodeFloat,
  decodeInt,
  decodeJson,
  decodeLine,
  decodeLineSegment,
  decodePath,
  decodePoint,
  decodeTid,
} from "../query/decoders.ts";
import { Oid } from "../query/oid.ts";

Deno.test("decodeBigint", () => {
  assertEquals(decodeBigint("18014398509481984"), 18014398509481984n);
});

Deno.test("decodeBigintArray", () => {
  assertEquals(
    decodeBigintArray(
      "{17365398509481972,9007199254740992,-10414398509481984}",
    ),
    [17365398509481972n, 9007199254740992n, -10414398509481984n],
  );
});

Deno.test("decodeBoolean", () => {
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

Deno.test("decodeBooleanArray", () => {
  assertEquals(decodeBooleanArray("{True,0,T}"), [true, false, true]);
  assertEquals(decodeBooleanArray("{no,Y,1}"), [false, true, true]);
});

Deno.test("decodeBox", () => {
  assertEquals(decodeBox("(12.4,2),(33,4.33)"), {
    a: { x: "12.4", y: "2" },
    b: { x: "33", y: "4.33" },
  });
  let testValue = "(12.4,2)";
  assertThrows(
    () => decodeBox(testValue),
    Error,
    `Invalid Box: "${testValue}". Box must have only 2 point, 1 given.`,
  );
  testValue = "(12.4,2),(123,123,123),(9303,33)";
  assertThrows(
    () => decodeBox(testValue),
    Error,
    `Invalid Box: "${testValue}". Box must have only 2 point, 3 given.`,
  );
  testValue = "(0,0),(123,123,123)";
  assertThrows(
    () => decodeBox(testValue),
    Error,
    `Invalid Box: "${testValue}" : Invalid Point: "(123,123,123)". Points must have only 2 coordinates, 3 given.`,
  );
  testValue = "(0,0),(100,r100)";
  assertThrows(
    () => decodeBox(testValue),
    Error,
    `Invalid Box: "${testValue}" : Invalid Point: "(100,r100)". Coordinate "r100" must be a valid number.`,
  );
});

Deno.test("decodeCircle", () => {
  assertEquals(decodeCircle("<(12.4,2),3.5>"), {
    point: { x: "12.4", y: "2" },
    radius: "3.5",
  });
  let testValue = "<(c21 23,2),3.5>";
  assertThrows(
    () => decodeCircle(testValue),
    Error,
    `Invalid Circle: "${testValue}" : Invalid Point: "(c21 23,2)". Coordinate "c21 23" must be a valid number.`,
  );
  testValue = "<(33,2),mn23 3.5>";
  assertThrows(
    () => decodeCircle(testValue),
    Error,
    `Invalid Circle: "${testValue}". Circle radius "mn23 3.5" must be a valid number.`,
  );
});

Deno.test("decodeDate", () => {
  assertEquals(decodeDate("2021-08-01"), new Date("2021-08-01 00:00:00-00"));
});

Deno.test("decodeDatetime", () => {
  assertEquals(
    decodeDatetime("2021-08-01"),
    new Date("2021-08-01 00:00:00-00"),
  );
  assertEquals(
    decodeDatetime("1997-12-17 07:37:16-08"),
    new Date("1997-12-17 07:37:16-08"),
  );
});

Deno.test("decodeFloat", () => {
  assertEquals(decodeFloat("3.14"), 3.14);
  assertEquals(decodeFloat("q743 44 23i4"), Number.NaN);
});

Deno.test("decodeInt", () => {
  assertEquals(decodeInt("42"), 42);
  assertEquals(decodeInt("q743 44 23i4"), Number.NaN);
});

Deno.test("decodeJson", () => {
  assertEquals(
    decodeJson(
      '{"key_1": "MY VALUE", "key_2": null, "key_3": 10, "key_4": {"subkey_1": true, "subkey_2": ["1",2]}}',
    ),
    {
      key_1: "MY VALUE",
      key_2: null,
      key_3: 10,
      key_4: { subkey_1: true, subkey_2: ["1", 2] },
    },
  );
  assertThrows(() => decodeJson("{ 'eqw' ; ddd}"));
});

Deno.test("decodeLine", () => {
  assertEquals(decodeLine("{100,50,0}"), { a: "100", b: "50", c: "0" });
  let testValue = "{100,50,0,100}";
  assertThrows(
    () => decodeLine("{100,50,0,100}"),
    Error,
    `Invalid Line: "${testValue}". Line in linear equation format must have 3 constants, 4 given.`,
  );
  testValue = "{100,d3km,0}";
  assertThrows(
    () => decodeLine(testValue),
    Error,
    `Invalid Line: "${testValue}". Line constant "d3km" must be a valid number.`,
  );
});

Deno.test("decodeLineSegment", () => {
  assertEquals(decodeLineSegment("((100,50),(350,350))"), {
    a: { x: "100", y: "50" },
    b: { x: "350", y: "350" },
  });
  let testValue = "((100,50),(r344,350))";
  assertThrows(
    () => decodeLineSegment(testValue),
    Error,
    `Invalid Line Segment: "${testValue}" : Invalid Point: "(r344,350)". Coordinate "r344" must be a valid number.`,
  );
  testValue = "((100),(r344,350))";
  assertThrows(
    () => decodeLineSegment(testValue),
    Error,
    `Invalid Line Segment: "${testValue}" : Invalid Point: "(100)". Points must have only 2 coordinates, 1 given.`,
  );
  testValue = "((100,50))";
  assertThrows(
    () => decodeLineSegment(testValue),
    Error,
    `Invalid Line Segment: "${testValue}". Line segments must have only 2 point, 1 given.`,
  );
  testValue = "((100,50),(350,350),(100,100))";
  assertThrows(
    () => decodeLineSegment(testValue),
    Error,
    `Invalid Line Segment: "${testValue}". Line segments must have only 2 point, 3 given.`,
  );
});

Deno.test("decodePath", () => {
  assertEquals(decodePath("[(100,50),(350,350)]"), [
    { x: "100", y: "50" },
    { x: "350", y: "350" },
  ]);
  assertEquals(decodePath("[(1,10),(2,20),(3,30)]"), [
    { x: "1", y: "10" },
    { x: "2", y: "20" },
    { x: "3", y: "30" },
  ]);
  let testValue = "((100,50),(350,kjf334))";
  assertThrows(
    () => decodePath(testValue),
    Error,
    `Invalid Path: "${testValue}" : Invalid Point: "(350,kjf334)". Coordinate "kjf334" must be a valid number.`,
  );
  testValue = "((100,50,9949))";
  assertThrows(
    () => decodePath(testValue),
    Error,
    `Invalid Path: "${testValue}" : Invalid Point: "(100,50,9949)". Points must have only 2 coordinates, 3 given.`,
  );
});

Deno.test("decodePoint", () => {
  assertEquals(decodePoint("(10.555,50.8)"), { x: "10.555", y: "50.8" });
  let testValue = "(1000)";
  assertThrows(
    () => decodePoint(testValue),
    Error,
    `Invalid Point: "${testValue}". Points must have only 2 coordinates, 1 given.`,
  );
  testValue = "(100.100,50,350)";
  assertThrows(
    () => decodePoint(testValue),
    Error,
    `Invalid Point: "${testValue}". Points must have only 2 coordinates, 3 given.`,
  );
  testValue = "(1,r344)";
  assertThrows(
    () => decodePoint(testValue),
    Error,
    `Invalid Point: "${testValue}". Coordinate "r344" must be a valid number.`,
  );
  testValue = "(cd 213ee,100)";
  assertThrows(
    () => decodePoint(testValue),
    Error,
    `Invalid Point: "${testValue}". Coordinate "cd 213ee" must be a valid number.`,
  );
});

Deno.test("decodeTid", () => {
  assertEquals(decodeTid("(19714398509481984,29383838509481984)"), [
    19714398509481984n,
    29383838509481984n,
  ]);
});

Deno.test("decode strategy", () => {
  const testValues = [
    {
      value: "40",
      column: new Column("test", 0, 0, Oid.int4, 0, 0, 0),
      parsed: 40,
    },
    {
      value: "my_value",
      column: new Column("test", 0, 0, Oid.text, 0, 0, 0),
      parsed: "my_value",
    },
    {
      value: "[(100,50),(350,350)]",
      column: new Column("test", 0, 0, Oid.path, 0, 0, 0),
      parsed: [
        { x: "100", y: "50" },
        { x: "350", y: "350" },
      ],
    },
    {
      value: '{"value_1","value_2","value_3"}',
      column: new Column("test", 0, 0, Oid.text_array, 0, 0, 0),
      parsed: ["value_1", "value_2", "value_3"],
    },
    {
      value: "1997-12-17 07:37:16-08",
      column: new Column("test", 0, 0, Oid.timestamp, 0, 0, 0),
      parsed: new Date("1997-12-17 07:37:16-08"),
    },
    {
      value: "Yes",
      column: new Column("test", 0, 0, Oid.bool, 0, 0, 0),
      parsed: true,
    },
    {
      value: "<(12.4,2),3.5>",
      column: new Column("test", 0, 0, Oid.circle, 0, 0, 0),
      parsed: { point: { x: "12.4", y: "2" }, radius: "3.5" },
    },
    {
      value: '{"test":1,"val":"foo","example":[1,2,false]}',
      column: new Column("test", 0, 0, Oid.jsonb, 0, 0, 0),
      parsed: { test: 1, val: "foo", example: [1, 2, false] },
    },
    {
      value: "18014398509481984",
      column: new Column("test", 0, 0, Oid.int8, 0, 0, 0),
      parsed: 18014398509481984n,
    },
    {
      value: "{3.14,1.11,0.43,200}",
      column: new Column("test", 0, 0, Oid.float4_array, 0, 0, 0),
      parsed: [3.14, 1.11, 0.43, 200],
    },
  ];

  for (const testValue of testValues) {
    const encodedValue = new TextEncoder().encode(testValue.value);

    // check default behavior
    assertEquals(decode(encodedValue, testValue.column), testValue.parsed);
    // check 'auto' behavior
    assertEquals(
      decode(encodedValue, testValue.column, { decodeStrategy: "auto" }),
      testValue.parsed,
    );
    // check 'string' behavior
    assertEquals(
      decode(encodedValue, testValue.column, { decodeStrategy: "string" }),
      testValue.value,
    );
  }
});
