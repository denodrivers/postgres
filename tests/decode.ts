import { test, assertEquals } from "../deps.ts";
import { Column, Format } from "../connection.ts";
import { Oid } from "../oid.ts";
import { decode } from "../decode.ts";

const encoder = new TextEncoder();

test(function decodeInet() {
  const column = new Column(
    "inet_col", // name
    16410,      // tableOid
    1, // index
    Oid.inet, // dataTypeOid
    -1, // columnLength
    -1, // typeModifier
    Format.TEXT // format
  );
  const value = encoder.encode("127.0.0.1");
  assertEquals(decode(value, column), "127.0.0.1");
});

test(function decodeMacaddr() {
  const column = new Column(
    "mac_col", // name
    16410, // tableOid
    2, // index
    Oid.macaddr, // dataTypeOid
    -1, // columnLength
    -1, // typeModifier
    Format.TEXT // format
  );
  const value = encoder.encode("08:00:2b:01:02:03");
  assertEquals(decode(value, column), "08:00:2b:01:02:03");
});

test(function decodeCidr() {
  const column = new Column(
    "cidr_col", // name
    16410, // tableOid
    2, // index
    Oid.cidr, // dataTypeOid
    -1, // columnLength
    -1, // typeModifier
    Format.TEXT // format
  );
  const value = encoder.encode("192.168.100.128/25");
  assertEquals(decode(value, column), "192.168.100.128/25");
});
