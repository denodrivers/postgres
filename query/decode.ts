import { Oid, OidType, OidTypes, OidValue } from "./oid.ts";
import { bold, yellow } from "../deps.ts";
import {
  decodeBigint,
  decodeBigintArray,
  decodeBoolean,
  decodeBooleanArray,
  decodeBox,
  decodeBoxArray,
  decodeBytea,
  decodeByteaArray,
  decodeCircle,
  decodeCircleArray,
  decodeDate,
  decodeDateArray,
  decodeDatetime,
  decodeDatetimeArray,
  decodeFloat,
  decodeFloatArray,
  decodeInt,
  decodeIntArray,
  decodeJson,
  decodeJsonArray,
  decodeLine,
  decodeLineArray,
  decodeLineSegment,
  decodeLineSegmentArray,
  decodePath,
  decodePathArray,
  decodePoint,
  decodePointArray,
  decodePolygon,
  decodePolygonArray,
  decodeStringArray,
  decodeTid,
  decodeTidArray,
} from "./decoders.ts";
import { ClientControls } from "../connection/connection_params.ts";
import { parseArray } from "./array_parser.ts";

export class Column {
  constructor(
    public name: string,
    public tableOid: number,
    public index: number,
    public typeOid: number,
    public columnLength: number,
    public typeModifier: number,
    public format: Format,
  ) {}
}

enum Format {
  TEXT = 0,
  BINARY = 1,
}

const decoder = new TextDecoder();

// TODO
// Decode binary fields
function decodeBinary() {
  throw new Error("Decoding binary data is not implemented!");
}

function decodeText(value: string, typeOid: number) {
  try {
    switch (typeOid) {
      case Oid.bpchar:
      case Oid.char:
      case Oid.cidr:
      case Oid.float8:
      case Oid.inet:
      case Oid.macaddr:
      case Oid.name:
      case Oid.numeric:
      case Oid.oid:
      case Oid.regclass:
      case Oid.regconfig:
      case Oid.regdictionary:
      case Oid.regnamespace:
      case Oid.regoper:
      case Oid.regoperator:
      case Oid.regproc:
      case Oid.regprocedure:
      case Oid.regrole:
      case Oid.regtype:
      case Oid.text:
      case Oid.time:
      case Oid.timetz:
      case Oid.uuid:
      case Oid.varchar:
      case Oid.void:
        return value;
      case Oid.bpchar_array:
      case Oid.char_array:
      case Oid.cidr_array:
      case Oid.float8_array:
      case Oid.inet_array:
      case Oid.macaddr_array:
      case Oid.name_array:
      case Oid.numeric_array:
      case Oid.oid_array:
      case Oid.regclass_array:
      case Oid.regconfig_array:
      case Oid.regdictionary_array:
      case Oid.regnamespace_array:
      case Oid.regoper_array:
      case Oid.regoperator_array:
      case Oid.regproc_array:
      case Oid.regprocedure_array:
      case Oid.regrole_array:
      case Oid.regtype_array:
      case Oid.text_array:
      case Oid.time_array:
      case Oid.timetz_array:
      case Oid.uuid_array:
      case Oid.varchar_array:
        return decodeStringArray(value);
      case Oid.float4:
        return decodeFloat(value);
      case Oid.float4_array:
        return decodeFloatArray(value);
      case Oid.int2:
      case Oid.int4:
      case Oid.xid:
        return decodeInt(value);
      case Oid.int2_array:
      case Oid.int4_array:
      case Oid.xid_array:
        return decodeIntArray(value);
      case Oid.bool:
        return decodeBoolean(value);
      case Oid.bool_array:
        return decodeBooleanArray(value);
      case Oid.box:
        return decodeBox(value);
      case Oid.box_array:
        return decodeBoxArray(value);
      case Oid.circle:
        return decodeCircle(value);
      case Oid.circle_array:
        return decodeCircleArray(value);
      case Oid.bytea:
        return decodeBytea(value);
      case Oid.byte_array:
        return decodeByteaArray(value);
      case Oid.date:
        return decodeDate(value);
      case Oid.date_array:
        return decodeDateArray(value);
      case Oid.int8:
        return decodeBigint(value);
      case Oid.int8_array:
        return decodeBigintArray(value);
      case Oid.json:
      case Oid.jsonb:
        return decodeJson(value);
      case Oid.json_array:
      case Oid.jsonb_array:
        return decodeJsonArray(value);
      case Oid.line:
        return decodeLine(value);
      case Oid.line_array:
        return decodeLineArray(value);
      case Oid.lseg:
        return decodeLineSegment(value);
      case Oid.lseg_array:
        return decodeLineSegmentArray(value);
      case Oid.path:
        return decodePath(value);
      case Oid.path_array:
        return decodePathArray(value);
      case Oid.point:
        return decodePoint(value);
      case Oid.point_array:
        return decodePointArray(value);
      case Oid.polygon:
        return decodePolygon(value);
      case Oid.polygon_array:
        return decodePolygonArray(value);
      case Oid.tid:
        return decodeTid(value);
      case Oid.tid_array:
        return decodeTidArray(value);
      case Oid.timestamp:
      case Oid.timestamptz:
        return decodeDatetime(value);
      case Oid.timestamp_array:
      case Oid.timestamptz_array:
        return decodeDatetimeArray(value);
      default:
        // A separate category for not handled values
        // They might or might not be represented correctly as strings,
        // returning them to the user as raw strings allows them to parse
        // them as they see fit
        return value;
    }
  } catch (_e) {
    console.error(
      bold(yellow(`Error decoding type Oid ${typeOid} value`)) +
        _e.message +
        "\n" +
        bold("Defaulting to null."),
    );
    // If an error occurred during decoding, return null
    return null;
  }
}

export function decode(
  value: Uint8Array,
  column: Column,
  controls?: ClientControls,
) {
  const strValue = decoder.decode(value);

  // check if there is a custom decoder
  if (controls?.decoders) {
    const oidType = OidTypes[column.typeOid as OidValue];
    // check if there is a custom decoder by oid (number) or by type name (string)
    const decoderFunc = controls.decoders?.[column.typeOid] ||
      controls.decoders?.[oidType];

    if (decoderFunc) {
      return decoderFunc(strValue, column.typeOid, parseArray);
    } // if no custom decoder is found and the oid is for an array type, check if there is
    // a decoder for the base type and use that with the array parser
    else if (oidType?.includes("_array")) {
      const baseOidType = oidType.replace("_array", "") as OidType;
      // check if the base type is in the Oid object
      if (baseOidType in Oid) {
        // check if there is a custom decoder for the base type by oid (number) or by type name (string)
        const decoderFunc = controls.decoders?.[Oid[baseOidType]] ||
          controls.decoders?.[baseOidType];
        if (decoderFunc) {
          return parseArray(
            strValue,
            (value: string) => decoderFunc(value, column.typeOid, parseArray),
          );
        }
      }
    }
  }

  // check if the decode strategy is `string`
  if (controls?.decodeStrategy === "string") {
    return strValue;
  }

  // else, default to 'auto' mode, which uses the typeOid to determine the decoding strategy
  if (column.format === Format.BINARY) {
    return decodeBinary();
  } else if (column.format === Format.TEXT) {
    return decodeText(strValue, column.typeOid);
  } else {
    throw new Error(`Unknown column format: ${column.format}`);
  }
}
