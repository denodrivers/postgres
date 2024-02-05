import { parseDate } from "../deps.ts";
import { parseArray } from "./array_parser.ts";
import type {
  Box,
  Circle,
  Float8,
  Line,
  LineSegment,
  Path,
  Point,
  Polygon,
  TID,
} from "./types.ts";

// Datetime parsing based on:
// https://github.com/bendrucker/postgres-date/blob/master/index.js
// Copyright (c) Ben Drucker <bvdrucker@gmail.com> (bendrucker.me). MIT License.
const BACKSLASH_BYTE_VALUE = 92;
const BC_RE = /BC$/;
const DATETIME_RE =
  /^(\d{1,})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,})?/;
const HEX = 16;
const HEX_PREFIX_REGEX = /^\\x/;
const TIMEZONE_RE = /([Z+-])(\d{2})?:?(\d{2})?:?(\d{2})?/;

export function decodeBigint(value: string): bigint {
  return BigInt(value);
}

export function decodeBigintArray(value: string) {
  return parseArray(value, decodeBigint);
}

export function decodeBoolean(value: string): boolean {
  const v = value.toLowerCase();
  return (
    v === "t" ||
    v === "true" ||
    v === "y" ||
    v === "yes" ||
    v === "on" ||
    v === "1"
  );
}

export function decodeBooleanArray(value: string) {
  return parseArray(value, decodeBoolean);
}

export function decodeBox(value: string): Box {
  const points = value.match(/\(.*?\)/g) || [];

  if (points.length !== 2) {
    throw new Error(
      `Invalid Box: "${value}". Box must have only 2 point, ${points.length} given.`,
    );
  }

  const [a, b] = points;

  try {
    return {
      a: decodePoint(a),
      b: decodePoint(b),
    };
  } catch (e) {
    throw new Error(`Invalid Box: "${value}" : ${e.message}`);
  }
}

export function decodeBoxArray(value: string) {
  return parseArray(value, decodeBox, ";");
}

export function decodeBytea(byteaStr: string): Uint8Array {
  if (HEX_PREFIX_REGEX.test(byteaStr)) {
    return decodeByteaHex(byteaStr);
  } else {
    return decodeByteaEscape(byteaStr);
  }
}

export function decodeByteaArray(value: string) {
  return parseArray(value, decodeBytea);
}

function decodeByteaEscape(byteaStr: string): Uint8Array {
  const bytes = [];
  let i = 0;
  let k = 0;
  while (i < byteaStr.length) {
    if (byteaStr[i] !== "\\") {
      bytes.push(byteaStr.charCodeAt(i));
      ++i;
    } else {
      if (/[0-7]{3}/.test(byteaStr.substr(i + 1, 3))) {
        bytes.push(parseInt(byteaStr.substr(i + 1, 3), 8));
        i += 4;
      } else {
        let backslashes = 1;
        while (
          i + backslashes < byteaStr.length &&
          byteaStr[i + backslashes] === "\\"
        ) {
          backslashes++;
        }
        for (k = 0; k < Math.floor(backslashes / 2); ++k) {
          bytes.push(BACKSLASH_BYTE_VALUE);
        }
        i += Math.floor(backslashes / 2) * 2;
      }
    }
  }
  return new Uint8Array(bytes);
}

function decodeByteaHex(byteaStr: string): Uint8Array {
  const bytesStr = byteaStr.slice(2);
  const bytes = new Uint8Array(bytesStr.length / 2);
  for (let i = 0, j = 0; i < bytesStr.length; i += 2, j++) {
    bytes[j] = parseInt(bytesStr[i] + bytesStr[i + 1], HEX);
  }
  return bytes;
}

export function decodeCircle(value: string): Circle {
  const [point, radius] = value
    .substring(1, value.length - 1)
    .split(/,(?![^(]*\))/) as [string, Float8];

  if (Number.isNaN(parseFloat(radius))) {
    throw new Error(
      `Invalid Circle: "${value}". Circle radius "${radius}" must be a valid number.`,
    );
  }

  try {
    return {
      point: decodePoint(point),
      radius: radius,
    };
  } catch (e) {
    throw new Error(`Invalid Circle: "${value}" : ${e.message}`);
  }
}

export function decodeCircleArray(value: string) {
  return parseArray(value, decodeCircle);
}

export function decodeDate(dateStr: string): Date | number {
  // there are special `infinity` and `-infinity`
  // cases representing out-of-range dates
  if (dateStr === "infinity") {
    return Number(Infinity);
  } else if (dateStr === "-infinity") {
    return Number(-Infinity);
  }

  return parseDate(dateStr, "yyyy-MM-dd");
}

export function decodeDateArray(value: string) {
  return parseArray(value, decodeDate);
}

export function decodeDatetime(dateStr: string): number | Date {
  /**
   * Postgres uses ISO 8601 style date output by default:
   * 1997-12-17 07:37:16-08
   */

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

export function decodeDatetimeArray(value: string) {
  return parseArray(value, decodeDatetime);
}

export function decodeInt(value: string): number {
  return parseInt(value, 10);
}

export function decodeIntArray(value: string) {
  return parseArray(value, decodeInt);
}

export function decodeFloat(value: string): number {
  return parseFloat(value);
}

export function decodeFloatArray(value: string) {
  return parseArray(value, decodeFloat);
}

export function decodeJson(value: string): unknown {
  return JSON.parse(value);
}

export function decodeJsonArray(value: string): unknown[] {
  return parseArray(value, JSON.parse);
}

export function decodeLine(value: string): Line {
  const equationConsts = value.substring(1, value.length - 1).split(",") as [
    Float8,
    Float8,
    Float8,
  ];

  if (equationConsts.length !== 3) {
    throw new Error(
      `Invalid Line: "${value}". Line in linear equation format must have 3 constants, ${equationConsts.length} given.`,
    );
  }

  equationConsts.forEach((c) => {
    if (Number.isNaN(parseFloat(c))) {
      throw new Error(
        `Invalid Line: "${value}". Line constant "${c}" must be a valid number.`,
      );
    }
  });

  const [a, b, c] = equationConsts;

  return {
    a: a,
    b: b,
    c: c,
  };
}

export function decodeLineArray(value: string) {
  return parseArray(value, decodeLine);
}

export function decodeLineSegment(value: string): LineSegment {
  const points = value.substring(1, value.length - 1).match(/\(.*?\)/g) || [];

  if (points.length !== 2) {
    throw new Error(
      `Invalid Line Segment: "${value}". Line segments must have only 2 point, ${points.length} given.`,
    );
  }

  const [a, b] = points;

  try {
    return {
      a: decodePoint(a),
      b: decodePoint(b),
    };
  } catch (e) {
    throw new Error(`Invalid Line Segment: "${value}" : ${e.message}`);
  }
}

export function decodeLineSegmentArray(value: string) {
  return parseArray(value, decodeLineSegment);
}

export function decodePath(value: string): Path {
  // Split on commas that are not inside parantheses
  // since encapsulated commas are separators for the point coordinates
  const points = value.substring(1, value.length - 1).split(/,(?![^(]*\))/);

  return points.map((point) => {
    try {
      return decodePoint(point);
    } catch (e) {
      throw new Error(`Invalid Path: "${value}" : ${e.message}`);
    }
  });
}

export function decodePathArray(value: string) {
  return parseArray(value, decodePath);
}

export function decodePoint(value: string): Point {
  const coordinates = value
    .substring(1, value.length - 1)
    .split(",") as Float8[];

  if (coordinates.length !== 2) {
    throw new Error(
      `Invalid Point: "${value}". Points must have only 2 coordinates, ${coordinates.length} given.`,
    );
  }

  const [x, y] = coordinates;

  if (Number.isNaN(parseFloat(x)) || Number.isNaN(parseFloat(y))) {
    throw new Error(
      `Invalid Point: "${value}". Coordinate "${
        Number.isNaN(parseFloat(x)) ? x : y
      }" must be a valid number.`,
    );
  }

  return {
    x: x,
    y: y,
  };
}

export function decodePointArray(value: string) {
  return parseArray(value, decodePoint);
}

export function decodePolygon(value: string): Polygon {
  try {
    return decodePath(value);
  } catch (e) {
    throw new Error(`Invalid Polygon: "${value}" : ${e.message}`);
  }
}

export function decodePolygonArray(value: string) {
  return parseArray(value, decodePolygon);
}

export function decodeStringArray(value: string) {
  if (!value) return null;
  return parseArray(value, (value) => value);
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

export function decodeTid(value: string): TID {
  const [x, y] = value.substring(1, value.length - 1).split(",");

  return [BigInt(x), BigInt(y)];
}

export function decodeTidArray(value: string) {
  return parseArray(value, decodeTid);
}
