export const DEFAULT_SETUP = [
  "DROP TABLE IF EXISTS ids;",
  "CREATE TABLE ids(id integer);",
  "INSERT INTO ids(id) VALUES(1);",
  "INSERT INTO ids(id) VALUES(2);",
  "DROP TABLE IF EXISTS timestamps;",
  "CREATE TABLE timestamps(dt timestamptz);",
  `INSERT INTO timestamps(dt) VALUES('2019-02-10T10:30:40.005+04:30');`,
  "DROP TABLE IF EXISTS bytes;",
  "CREATE TABLE bytes(b bytea);",
  "INSERT INTO bytes VALUES(E'foo\\\\000\\\\200\\\\\\\\\\\\377')",
  "CREATE OR REPLACE FUNCTION CREATE_NOTICE () RETURNS INT AS $$ BEGIN RAISE NOTICE 'NOTICED'; RETURN (SELECT 1); END; $$ LANGUAGE PLPGSQL;",
];

let has_env_access = true;
try {
  Deno.env.toObject();
} catch (e) {
  if (e instanceof Deno.errors.PermissionDenied) {
    has_env_access = false;
  } else {
    throw e;
  }
}

export { has_env_access };
