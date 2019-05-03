import { Oid } from "./oid.ts";
import { Column, Format } from "./connection.ts";

// Datetime parsing based on:
// https://github.com/bendrucker/postgres-date/blob/master/index.js
const DATETIME_RE = /^(\d{1,})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,})?/;
const DATE_RE = /^(\d{1,})-(\d{2})-(\d{2})$/;
const TIMEZONE_RE = /([Z+-])(\d{2})?:?(\d{2})?:?(\d{2})?/;
const BC_RE = /BC$/;

function decodeDate(dateStr: string): null | Date {
  const matches = DATE_RE.exec(dateStr);

  if (!matches) {
    return null;
  }

  const year = parseInt(matches[1], 10);
  // remember JS dates are 0-based
  const month = parseInt(matches[2], 10) - 1;
  const day = parseInt(matches[3], 10);
  const date = new Date(year, month, day);
  // use `setUTCFullYear` because if date is from first
  // century `Date`'s compatibility for millenium bug
  // would set it as 19XX
  date.setUTCFullYear(year);

  return date;
}
/**
 * Decode numerical timezone offset from provided date string.
 *
 * Matched these kinds:
 * - `Z (UTC)`
 * - `-05`
 * - `+06:30`
 * - `+06:30:10`
 *
 * Returns offset in miliseconds.
 */
function decodeTimezoneOffset(dateStr: string): null | number {
  // get rid of date part as TIMEZONE_RE would match '-MM` part
  const timeStr = dateStr.split(" ")[1];
  const matches = TIMEZONE_RE.exec(timeStr);

  if (!matches) {
    return null;
  }

  const type = matches[1];

  if (type === "Z") {
    // Zulu timezone === UTC === 0
    return 0;
  }

  // in JS timezone offsets are reversed, ie. timezones
  // that are "positive" (+01:00) are represented as negative
  // offsets and vice-versa
  const sign = type === "-" ? 1 : -1;

  const hours = parseInt(matches[2], 10);
  const minutes = parseInt(matches[3] || "0", 10);
  const seconds = parseInt(matches[4] || "0", 10);

  const offset = hours * 3600 + minutes * 60 + seconds;

  return sign * offset * 1000;
}

function decodeDatetime(dateStr: string): null | number | Date {
  /**
   * Postgres uses ISO 8601 style date output by default:
   * 1997-12-17 07:37:16-08
   */

  // there are special `infinity` and `-infinity`
  // cases representing out-of-range dates
  if (dateStr === "infinity") {
    return Number(Infinity);
  } else if (dateStr === "-infinity") {
    return Number(-Infinity);
  }

  const matches = DATETIME_RE.exec(dateStr);

  if (!matches) {
    return decodeDate(dateStr);
  }

  const isBC = BC_RE.test(dateStr);

  const year = parseInt(matches[1], 10) * (isBC ? -1 : 1);
  // remember JS dates are 0-based
  const month = parseInt(matches[2], 10) - 1;
  const day = parseInt(matches[3], 10);
  const hour = parseInt(matches[4], 10);
  const minute = parseInt(matches[5], 10);
  const second = parseInt(matches[6], 10);
  // ms are written as .007
  const msMatch = matches[7];
  const ms = msMatch ? 1000 * parseFloat(msMatch) : 0;

  let date: Date;

  const offset = decodeTimezoneOffset(dateStr);
  if (offset === null) {
    date = new Date(year, month, day, hour, minute, second, ms);
  } else {
    // This returns miliseconds from 1 January, 1970, 00:00:00,
    // adding decoded timezone offset will construct proper date object.
    const utc = Date.UTC(year, month, day, hour, minute, second, ms);
    date = new Date(utc + offset);
  }

  // use `setUTCFullYear` because if date is from first
  // century `Date`'s compatibility for millenium bug
  // would set it as 19XX
  date.setUTCFullYear(year);
  return date;
}

function decodeBinary() {
  throw new Error("Not implemented!");
}

const decoder = new TextDecoder();

function decodeText(value: Uint8Array, typeOid: number): any {
  const strValue = decoder.decode(value);

  switch (typeOid) {
    case Oid.char:
    case Oid.varchar:
    case Oid.text:
    case Oid.time:
    case Oid.timetz:
      return strValue;
    case Oid.bool:
      return strValue[0] === "t";
    case Oid.int2:
    case Oid.int4:
    case Oid.int8:
      return parseInt(strValue, 10);
    case Oid.float4:
    case Oid.float8:
      return parseFloat(strValue);
    case Oid.timestamptz:
    case Oid.timestamp:
      return decodeDatetime(strValue);
    case Oid.date:
      return decodeDate(strValue);
    case Oid.json:
    case Oid.jsonb:
      return JSON.parse(strValue);
    default:
      throw new Error(`Don't know how to parse column type: ${typeOid}`);
  }
}

export function decode(value: Uint8Array, column: Column) {
  if (column.format === Format.BINARY) {
    return decodeBinary();
  } else if (column.format === Format.TEXT) {
    return decodeText(value, column.typeOid);
  } else {
    throw new Error(`Unknown column format: ${column.format}`);
  }
}
