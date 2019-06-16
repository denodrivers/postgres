export const DEFAULT_SETUP = [
  "DROP TABLE IF EXISTS ids;",
  "CREATE TABLE ids(id integer);",
  "INSERT INTO ids(id) VALUES(1);",
  "INSERT INTO ids(id) VALUES(2);",
  "DROP TABLE IF EXISTS timestamps;",
  "CREATE TABLE timestamps(dt timestamptz);",
  `INSERT INTO timestamps(dt) VALUES('2019-02-10T10:30:40.005+04:30');`
];

export const TEST_CONNECTION_PARAMS = {
  user: "test",
  password: "test",
  database: "deno_postgres",
  host: "127.0.0.1",
  port: "5432"
};
