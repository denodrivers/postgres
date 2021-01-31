/**
 * https://www.postgresql.org/docs/13/datatype-geometric.html#id-1.5.7.16.8
 */
export interface Box {
  a: Point;
  b: Point;
}

/**
 * https://www.postgresql.org/docs/13/datatype-geometric.html#DATATYPE-CIRCLE
 */
export interface Circle {
  point: Point;
  radius: Float8;
}

/**
 * Decimal-like string. Uses dot to split the decimal
 * 
 * Example: 1.89, 2, 2.1
 * 
 * https://www.postgresql.org/docs/13/datatype-numeric.html#DATATYPE-FLOAT
 * */
export type Float4 = "string";

/**
 * Decimal-like string. Uses dot to split the decimal
 * 
 * Example: 1.89, 2, 2.1
 * 
 * https://www.postgresql.org/docs/13/datatype-numeric.html#DATATYPE-FLOAT
 * */
export type Float8 = "string";

/**
 * https://www.postgresql.org/docs/13/datatype-geometric.html#DATATYPE-LINE
 */
export interface Line {
  a: Float8;
  b: Float8;
  c: Float8;
}

/**
 * https://www.postgresql.org/docs/13/datatype-geometric.html#DATATYPE-LSEG
 */
export interface LineSegment {
  a: Point;
  b: Point;
}

/**
 * https://www.postgresql.org/docs/13/datatype-geometric.html#id-1.5.7.16.9
 */
export type Path = Point[];

/**  
 * https://www.postgresql.org/docs/13/datatype-geometric.html#id-1.5.7.16.5
 */
export interface Point {
  x: Float8;
  y: Float8;
}

/**
 * https://www.postgresql.org/docs/13/datatype-geometric.html#DATATYPE-POLYGON
 */
export type Polygon = Point[];

/**
 * https://www.postgresql.org/docs/13/datatype-oid.html
 */
export type TID = [BigInt, BigInt];

/**
 * Additional to containing normal dates, they can contain 'Infinity'
 * values, so handle them with care
 * 
 * https://www.postgresql.org/docs/13/datatype-datetime.html
 */
export type Timestamp = Date | number;
