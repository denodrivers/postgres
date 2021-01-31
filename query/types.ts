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
 * https://www.postgresql.org/docs/13/datatype-geometric.html#id-1.5.7.16.5
 */
export interface Point {
  x: Float8;
  y: Float8;
}

/**
 * https://www.postgresql.org/docs/13/datatype-oid.html
 */
export type TID = [BigInt, BigInt];
