# deno-postgres

![Build Status](https://img.shields.io/github/workflow/status/denodrivers/postgres/ci?label=Build&logo=github&style=flat-square)
[![Discord server](https://img.shields.io/discord/768918486575480863?color=blue&label=Ask%20for%20help%20here&logo=discord&style=flat-square)](https://discord.gg/HEdTCvZUSf)
![Manual](https://img.shields.io/github/v/release/denodrivers/postgres?color=orange&label=Manual&logo=deno&style=flat-square)
[![Documentation](https://img.shields.io/github/v/release/denodrivers/postgres?color=yellow&label=Documentation&logo=deno&style=flat-square)](https://doc.deno.land/https/deno.land/x/postgres@v0.14.1/mod.ts)
![License](https://img.shields.io/github/license/denodrivers/postgres?color=yellowgreen&label=License&style=flat-square)

`deno-postgres` is a lightweight PostgreSQL driver for Deno focused on user
experience. It provides abstractions for most common operations such as typed
queries, prepared statements, connection pools and transactions.

```ts
import { Client } from "https://deno.land/x/postgres/mod.ts";

const client = new Client({
  user: "user",
  database: "test",
  hostname: "localhost",
  port: 5432,
});
await client.connect();

const array_result = await client.queryArray("SELECT ID, NAME FROM PEOPLE");
console.log(array_result.rows); // [[1, 'Carlos'], [2, 'John'], ...]

const object_result = await client.queryObject("SELECT ID, NAME FROM PEOPLE");
console.log(object_result.rows); // [{id: 1, name: 'Carlos'}, {id: 2, name: 'John'}, ...]

await client.end();
```

## Connection Management

### Connecting to your DB

All `deno-postgres` clients provide the following options to authenticate and
manage your connections

```ts
import { Client } from "https://deno.land/x/postgres/mod.ts";

let config;

// You can use the connection interface to set the connection properties
config = {
  applicationName: "my_custom_app",
  connection: {
    attempts: 1,
  },
  database: "test",
  hostname: "localhost",
  password: "password",
  port: 5432,
  user: "user",
  tls: {
    enforce: false,
  },
};

// Alternatively you can use a connection string
config =
  "postgres://user:password@localhost:5432/test?application_name=my_custom_app&sslmode=require";

const client = new Client(config);
await client.connect();
await client.end();
```

### Connection string

A valid connection string must reflect most of the options that will otherwise
be available in a client configuration, with the following structure:

```
driver://user:password@host:port/database_name
```

#### Password encoding

One thing that must be taken into consideration is that passwords contained
inside the URL must be properly encoded in order to be passed down to the
database. You can achieve that by using the JavaScript API `encodeURIComponent`
and passing your password as an argument.

**Invalid**:

- `postgres://me:Mtx%3@localhost:5432/my_database`
- `postgres://me:pássword!=with_symbols@localhost:5432/my_database`

**Valid**:

- `postgres://me:Mtx%253@localhost:5432/my_database`
- `postgres://me:p%C3%A1ssword!%3Dwith_symbols@localhost:5432/my_database`

When possible and if the password is not encoded correctly, the driver will try
and pass the raw password to the database, however it's highly recommended that
all passwords are always encoded.

#### URL parameters

Additional to the basic structure, connection strings may contain a variety of
search parameters such as the following:

- application_name: The equivalent of applicationName in client configuration
- sslmode: Allows you to specify the tls configuration for your client, the
  allowed values are the following:
  - disable: Skip TLS connection altogether
  - prefer: Attempt to stablish a TLS connection, default to unencrypted if the
    negotiation fails
  - require: Attempt to stablish a TLS connection, abort the connection if the
    negotiation fails

#### Database reconnection

It's a very common occurrence to get broken connections due to connectivity
issues or OS related problems, however while this may be a minor inconvenience
in development, it becomes a serious matter in a production environment if not
handled correctly. To mitigate the impact of disconnected clients
`deno-postgres` allows the developer to stablish a new connection with the
database automatically before executing a query on a broken connection.

To manage the number of reconnection attempts, adjust the `connection.attempts`
parameter in your client options. Every client will default to one try before
throwing a disconnection error.

```ts
try {
  // We will forcefully close our current connection
  await client.queryArray`SELECT PG_TERMINATE_BACKEND(${client.session.pid})`;
} catch (e) {
  // Manage the error
}

// The client will reconnect silently before running the query
await client.queryArray`SELECT 1`;
```

If automatic reconnection is not desired, the developer can simply set the
number of attempts to zero and manage connection and reconnection manually

```ts
const client = new Client({
  connection: {
    attempts: 0,
  },
});

try {
  await runQueryThatWillFailBecauseDisconnection();
  // From here on now, the client will be marked as "disconnected"
} catch (e) {
  if (e instanceof ConnectionError) {
    // Reconnect manually
    await client.connect();
  } else {
    throw e;
  }
}
```

Your initial connection will also be affected by this setting, in a slightly
different manner than already active errored connections. If you fail to connect
to your database in the first attempt, the client will keep trying to connect as
many times as requested, meaning that if your attempt configuration is three,
your total first-connection-attempts will ammount to four.

#### SSL/TLS connection

Using a database that supports TLS is quite simple. After providing your
connection parameters, the client will check if the database accepts encrypted
connections and will attempt to connect with the parameters provided. If the
connection is successful, the following transactions will be carried over TLS.

However, if the connection fails for whatever reason the user can choose to
terminate the connection or to attempt to connect using a non-encrypted one.
This behavior can be defined using the connection parameter `tls.enforce` or the
"required" option when using a connection string.

If set, the driver will fail inmediately if no TLS connection can be
established, otherwise the driver will attempt to connect without encryption
after TLS connection has failed, but will display a warning containing the
reason why the TLS connection failed. **This is the default configuration**.

If you wish to skip TLS connections altogether, you can do so by passing false
as a parameter in the `tls.enabled` option or the "disable" option when using a
connection string. Although discouraged, this option is pretty useful when
dealing with development databases or versions of Postgres that didn't support
TLS encrypted connections.

Sadly, stablishing a TLS connection in the way Postgres requires it isn't
possible without the `Deno.startTls` API, which is currently marked as unstable.
This is a situation that will be solved once this API is stabilized, however I
don't have an estimated time of when that might happen.

##### About invalid TLS certificates

There is a miriad of factors you have to take into account when using a
certificate to encrypt your connection that, if not taken care of, can render
your certificate invalid.

When using a self signed certificate, make sure to specify the PEM encoded CA
certificate in the `tls.caCertificates` option when creating the Postgres
`Client` (Deno 1.15.0 later), or using the `--cert` option when starting Deno
(Deno 1.12.2 or later).

TLS can be disabled from your server by editing your `postgresql.conf` file and
setting the `ssl` option to `off`, or in the driver side by using the "disabled"
option in the client configuration.

#### Env parameters

The values required to connect to the database can be read directly from
environmental variables, given the case that the user doesn't provide them while
initializing the client. The only requirement for this variables to be read is
for Deno to be run with `--allow-env` permissions

The env variables that the client will recognize are taken from `libpq` to keep
consistency with other PostgreSQL clients out there (see
https://www.postgresql.org/docs/14/libpq-envars.html)

```ts
// PGUSER=user PGPASSWORD=admin PGDATABASE=test deno run --allow-net --allow-env --unstable database.js
import { Client } from "https://deno.land/x/postgres/mod.ts";

const client = new Client();
await client.connect();
await client.end();
```

### Clients (Single clients)

Clients are the most basic block for establishing communication with your
database. They provide abstractions over queries, transactions and connection
management. In `deno-postgres`, similar clients such as the transaction and pool
client inherit it's functionality from the basic client, so the available
methods will be very similar across implementations.

You can create a new client by providing the required connection parameters:

```ts
const client = new Client(connection_parameters);
await client.connect();
await client.queryArray`UPDATE MY_TABLE SET MY_FIELD = 0`;
await client.end();
```

The basic client does not provide any concurrency features, meaning that in
order to execute two queries simultaneously, you would need to create two
different clients that can communicate with your database without conflicting
with each other.

```ts
const client_1 = new Client(connection_parameters);
await client_1.connect();
// Even if operations are not awaited, they will be executed in the order they were
// scheduled
client_1.queryArray`UPDATE MY_TABLE SET MY_FIELD = 0`;
client_1.queryArray`DELETE FROM MY_TABLE`;

const client_2 = new Client(connection_parameters);
await client_2.connect();
// `client_2` will execute it's queries in parallel to `client_1`
const { rows: result } = await client_2.queryArray`SELECT * FROM MY_TABLE`;

await client_1.end();
await client_2.end();
```

Ending a client will cause it to destroy it's connection with the database,
forcing you to reconnect in order to execute operations again. In Postgres,
connections are a synonym for session, which means that temporal operations such
as the creation of temporal tables or the use of the `PG_TEMP` schema will not
be persisted after your connection is terminated.

### Pools

For stronger management and scalability, you can use **pools**:

```ts
const POOL_CONNECTIONS = 20;
const dbPool = new Pool({
  database: "database",
  hostname: "hostname",
  password: "password",
  port: 5432,
  user: "user",
}, POOL_CONNECTIONS);

const client = await dbPool.connect(); // 19 connections are still available
await client.queryArray`UPDATE X SET Y = 'Z'`;
client.release(); // This connection is now available for use again
```

The number of pools is up to you, but a pool of 20 is good for small
applications, this can differ based on how active your application is. Increase
or decrease where necessary.

#### Clients vs connection pools

Each pool eagerly creates as many connections as requested, allowing you to
execute several queries concurrently. This also improves performance, since
creating a whole new connection for each query can be an expensive operation,
making pools stand out from clients when dealing with concurrent, reusable
connections.

```ts
// Open 4 connections at once
const pool = new Pool(db_params, 4);

// This connections are already open, so there will be no overhead here
const pool_client_1 = await pool.connect();
const pool_client_2 = await pool.connect();
const pool_client_3 = await pool.connect();
const pool_client_4 = await pool.connect();

// Each one of these will have to open a new connection and they won't be
// reusable after the client is closed
const client_1 = new Client(db_params);
await client_1.connect();
const client_2 = new Client(db_params);
await client_2.connect();
const client_3 = new Client(db_params);
await client_3.connect();
const client_4 = new Client(db_params);
await client_4.connect();
```

#### Lazy pools

Another good option is to create such connections on demand and have them
available after creation. That way, one of the available connections will be
used instead of creating a new one. You can do this by indicating the pool to
start each connection lazily.

```ts
const pool = new Pool(db_params, 4, true); // `true` indicates lazy connections

// A new connection is created when requested
const client_1 = await pool.connect();
client_1.release();

// No new connection is created, previously initialized one is available
const client_2 = await pool.connect();

// A new connection is created because all the other ones are in use
const client_3 = await pool.connect();

await client_2.release();
await client_3.release();
```

#### Pools made simple

The following example is a simple abstraction over pools that allow you to
execute one query and release the used client after returning the result in a
single function call

```ts
async function runQuery(query: string) {
  const client = await pool.connect();
  let result;
  try {
    result = await client.queryObject(query);
  } finally {
    client.release();
  }
  return result;
}

await runQuery("SELECT ID, NAME FROM users"); // [{id: 1, name: 'Carlos'}, {id: 2, name: 'John'}, ...]
await runQuery("SELECT ID, NAME FROM users WHERE id = '1'"); // [{id: 1, name: 'Carlos'}, {id: 2, name: 'John'}, ...]
```

## API

### Queries

#### Simple query

```ts
const result = await client.queryArray("SELECT ID, NAME FROM PEOPLE");
console.log(result.rows);
```

#### Prepared statement

```ts
{
  const result = await client.queryArray(
    "SELECT ID, NAME FROM PEOPLE WHERE AGE > $1 AND AGE < $2",
    10,
    20,
  );
  console.log(result.rows);
}

{
  // equivalent using QueryConfig interface
  const result = await client.queryArray({
    text: "SELECT ID, NAME FROM PEOPLE WHERE AGE > $1 AND AGE < $2",
    args: [10, 20],
  });
  console.log(result.rows);
}
```

#### Prepared statement with template strings

```ts
{
  const result = await client.queryArray
    `SELECT ID, NAME FROM PEOPLE WHERE AGE > ${10} AND AGE < ${20}`;
  console.log(result.rows);
}

{
  const min = 10;
  const max = 20;
  const result = await client.queryObject
    `SELECT ID, NAME FROM PEOPLE WHERE AGE > ${min} AND AGE < ${max}`;
  console.log(result.rows);
}
```

##### Why use template strings?

Template string queries get executed as prepared statements, which protects your
SQL against injection to a certain degree (see
https://security.stackexchange.com/questions/15214/are-prepared-statements-100-safe-against-sql-injection).

Also, they are easier to write and read than plain SQL queries and are more
compact than using the `QueryOptions` interface

For example, template strings can turn the following:

```ts
await client.queryObject({
  text: "SELECT ID, NAME FROM PEOPLE WHERE AGE > $1 AND AGE < $2",
  args: [10, 20],
});
```

Into a much more readable:

```ts
await client.queryObject
  `SELECT ID, NAME FROM PEOPLE WHERE AGE > ${10} AND AGE < ${20}`;
```

However, a limitation of template strings is that you can't pass any parameters
provided by the `QueryOptions` interface, so the only options you have available
are really `text` and `args` to execute your query

#### Generic Parameters

Both the `queryArray` and `queryObject` functions have a generic implementation
that allow users to type the result of the query

```typescript
{
  const array_result = await client.queryArray<[number, string]>(
    "SELECT ID, NAME FROM PEOPLE WHERE ID = 17",
  );
  // [number, string]
  const person = array_result.rows[0];
}

{
  const array_result = await client.queryArray<[number, string]>
    `SELECT ID, NAME FROM PEOPLE WHERE ID = ${17}`;
  // [number, string]
  const person = array_result.rows[0];
}

{
  const object_result = await client.queryObject<{ id: number; name: string }>(
    "SELECT ID, NAME FROM PEOPLE WHERE ID = 17",
  );
  // {id: number, name: string}
  const person = object_result.rows[0];
}

{
  const object_result = await client.queryObject<{ id: number; name: string }>
    `SELECT ID, NAME FROM PEOPLE WHERE ID = ${17}`;
  // {id: number, name: string}
  const person = object_result.rows[0];
}
```

#### Object query

The `queryObject` function allows you to return the results of the executed
query as a set objects, allowing easy management with interface like types.

```ts
interface User {
  id: number;
  name: string;
}

const result = await client.queryObject<User>(
  "SELECT ID, NAME FROM PEOPLE",
);

// User[]
const users = result.rows;
```

However, the actual values of the query are determined by the aliases given to
those columns inside the query, so executing something like the following will
result in a totally different result to the one the user might expect

```ts
const result = await client.queryObject(
  "SELECT ID, SUBSTR(NAME, 0, 2) FROM PEOPLE",
);

const users = result.rows; // [{id: 1, substr: 'Ca'}, {id: 2, substr: 'Jo'}, ...]
```

To deal with this issue, it's recommended to provide a field list that maps to
the expected properties we want in the resulting object

```ts
const result = await client.queryObject(
  {
    text: "SELECT ID, SUBSTR(NAME, 0, 2) FROM PEOPLE",
    fields: ["id", "name"],
  },
);

const users = result.rows; // [{id: 1, name: 'Ca'}, {id: 2, name: 'Jo'}, ...]
```

**Don't use TypeScript generics to map these properties**, this generics only
exist at compile time and won't affect the final outcome of the query

```ts
interface User {
  id: number;
  name: string;
}

const result = await client.queryObject<User>(
  "SELECT ID, SUBSTR(NAME, 0, 2) FROM PEOPLE",
);

const users = result.rows; // TypeScript says this will be User[]
console.log(rows); // [{id: 1, substr: 'Ca'}, {id: 2, substr: 'Jo'}, ...]

// Don't trust TypeScript :)
```

Other aspects to take into account when using the `fields` argument:

- The fields will be matched in the order they were declared
- The fields will override any alias in the query
- These field properties must be unique otherwise the query will throw before
  execution
- The fields must not have special characters and not start with a number
- The fields must match the number of fields returned on the query, otherwise
  the query will throw on execution

```ts
{
  // This will throw because the property id is duplicated
  await client.queryObject(
    {
      text: "SELECT ID, SUBSTR(NAME, 0, 2) FROM PEOPLE",
      fields: ["id", "ID"],
    },
  );
}

{
  // This will throw because the returned number of columns don't match the
  // number of defined ones in the function call
  await client.queryObject(
    {
      text: "SELECT ID, SUBSTR(NAME, 0, 2) FROM PEOPLE",
      fields: ["id", "name", "something_else"],
    },
  );
}
```

### Transactions

A lot of effort was put into abstracting Transactions in the library, and the
final result is an API that is both simple to use and offers all of the options
and features that you would get by executing SQL statements, plus and extra
layer of abstraction that helps you catch mistakes ahead of time.

#### Creating a transaction

Both simple clients and connection pools are capable of creating transactions,
and they work in a similar fashion internally.

```ts
const transaction = my_client.createTransaction("transaction_1", {
  isolation_level: "repeatable_read",
});

await transaction.begin();
// Safe operations that can be rolled back if the result is not the expected
await transaction.queryArray`UPDATE TABLE X SET Y = 1`;
// All changes are saved
await transaction.commit();
```

#### Transaction operations vs client operations

##### Transaction locks

Due to how SQL transactions work, everytime you begin a transaction all queries
you do in your session will run inside that transaction context. This is a
problem for query execution since it might cause queries that are meant to do
persistent changes to the database to live inside this context, making them
susceptible to be rolled back unintentionally. We will call this kind of queries
**unsafe operations**.

Everytime you create a transaction the client you use will get a lock, with the
purpose of blocking any external queries from running while a transaction takes
course, effectively avoiding all unsafe operations.

```ts
const transaction = my_client.createTransaction("transaction_1");

await transaction.begin();
await transaction.queryArray`UPDATE TABLE X SET Y = 1`;
// Oops, the client is locked out, this operation will throw
await my_client.queryArray`DELETE TABLE X`;
// Client is released after the transaction ends
await transaction.commit();

// Operations in the main client can now be executed normally
await client.queryArray`DELETE TABLE X`;
```

For this very reason however, if you are using transactions in an application
with concurrent access like an API, it is recommended that you don't use the
Client API at all. If you do so, the client will be blocked from executing other
queries until the transaction has finished. Instead of that, use a connection
pool, that way all your operations will be executed in a different context
without locking the main client.

```ts
const client_1 = await pool.connect();
const client_2 = await pool.connect();

const transaction = client_1.createTransaction("transaction_1");

await transaction.begin();
await transaction.queryArray`UPDATE TABLE X SET Y = 1`;
// Code that is meant to be executed concurrently, will run normally
await client_2.queryArray`DELETE TABLE Z`;
await transaction.commit();

await client_1.release();
await client_2.release();
```

##### Transaction errors

When you are inside a Transaction block in PostgreSQL, reaching an error is
terminal for the transaction. Executing the following in PostgreSQL will cause
all changes to be undone and the transaction to become unusable until it has
ended.

```sql
BEGIN;

UPDATE MY_TABLE SET NAME = 'Nicolas';
SELECT []; -- Syntax error, transaction will abort
SELECT ID FROM MY_TABLE; -- Will attempt to execute, but will fail cause transaction was aborted

COMMIT; -- Transaction will end, but no changes to MY_TABLE will be made
```

However, due to how JavaScript works we can handle this kinds of errors in a
more fashionable way. All failed queries inside a transaction will automatically
end it and release the main client.

```ts
/**
 * This function will return a boolean regarding the transaction completion status
 */
function executeMyTransaction() {
  try {
    const transaction = client.createTransaction("abortable");
    await transaction.begin();

    await transaction.queryArray`UPDATE MY_TABLE SET NAME = 'Nicolas'`;
    await transaction.queryArray`SELECT []`; // Error will be thrown, transaction will be aborted
    await transaction.queryArray`SELECT ID FROM MY_TABLE`; // Won't even attempt to execute

    await transaction.commit(); // Don't even need it, transaction was already ended
  } catch (e) {
    return false;
  }

  return true;
}
```

This limits only to database related errors though, regular errors won't end the
connection and may allow the user to execute a different code path. This is
specially good for ahead of time validation errors such as the ones found in the
rollback and savepoint features.

```ts
const transaction = client.createTransaction("abortable");
await transaction.begin();

let savepoint;
try{
  // Oops, savepoints can't start with a number
  // Validation error, transaction won't be ended
  savepoint = await transaction.savepoint("1");
}catch(e){
  // We validate the error was not related to transaction execution
  if(!(e instance of TransactionError)){
    // We create a good savepoint we can use
    savepoint = await transaction.savepoint("a_valid_name");
  }else{
    throw e;
  }
}

// Transaction is still open and good to go
await transaction.queryArray`UPDATE MY_TABLE SET NAME = 'Nicolas'`;
await transaction.rollback(savepoint); // Undo changes after the savepoint creation

await transaction.commit();
```

#### Transaction options

PostgreSQL provides many options to customize the behavior of transactions, such
as isolation level, read modes and startup snapshot. All this options can be set
by passing a second argument to the `startTransaction` method

```ts
const transaction = client.createTransaction("ts_1", {
  isolation_level: "serializable",
  read_only: true,
  snapshot: "snapshot_code",
});
```

##### Isolation Level

Setting an isolation level protects your transaction from operations that took
place _after_ the transaction had begun.

The following is a demonstration. A sensible transaction that loads a table with
some very important test results and the students that passed said test. This is
a long running operation, and in the meanwhile someone is tasked to cleanup the
results from the tests table because it's taking too much space in the database.

If the transaction were to be executed as it follows, the test results would be
lost before the graduated students could be extracted from the original table,
causing a mismatch in the data.

```ts
const client_1 = await pool.connect();
const client_2 = await pool.connect();

const transaction = client_1.createTransaction("transaction_1");

await transaction.begin();

await transaction.queryArray
  `CREATE TABLE TEST_RESULTS (USER_ID INTEGER, GRADE NUMERIC(10,2))`;
await transaction.queryArray`CREATE TABLE GRADUATED_STUDENTS (USER_ID INTEGER)`;

// This operation takes several minutes
await transaction.queryArray`INSERT INTO TEST_RESULTS
  SELECT
    USER_ID, GRADE
  FROM TESTS
  WHERE TEST_TYPE = 'final_test'`;

// A third party, whose task is to clean up the test results
// executes this query while the operation above still takes place
await client_2.queryArray`DELETE FROM TESTS WHERE TEST_TYPE = 'final_test'`;

// Test information is gone, no data will be loaded into the graduated students table
await transaction.queryArray`INSERT INTO GRADUATED_STUDENTS
  SELECT
    USER_ID
  FROM TESTS
  WHERE TEST_TYPE = 'final_test'
  AND GRADE >= 3.0`;

await transaction.commit();

await client_1.release();
await client_2.release();
```

In order to ensure scenarios like the above don't happen, Postgres provides the
following levels of transaction isolation:

- Read committed: This is the normal behavior of a transaction. External changes
  to the database will be visible inside the transaction once they are
  committed.

- Repeatable read: This isolates the transaction in a way that any external
  changes to the data we are reading won't be visible inside the transaction
  until it has finished
  ```ts
  const client_1 = await pool.connect();
  const client_2 = await pool.connect();

  const transaction = await client_1.createTransaction("isolated_transaction", {
    isolation_level: "repeatable_read",
  });

  await transaction.begin();
  // This locks the current value of IMPORTANT_TABLE
  // Up to this point, all other external changes will be included
  const { rows: query_1 } = await transaction.queryObject<{ password: string }>
    `SELECT PASSWORD FROM IMPORTANT_TABLE WHERE ID = ${my_id}`;
  const password_1 = rows[0].password;

  // Concurrent operation executed by a different user in a different part of the code
  await client_2.queryArray
    `UPDATE IMPORTANT_TABLE SET PASSWORD = 'something_else' WHERE ID = ${the_same_id}`;

  const { rows: query_2 } = await transaction.queryObject<{ password: string }>
    `SELECT PASSWORD FROM IMPORTANT_TABLE WHERE ID = ${my_id}`;
  const password_2 = rows[0].password;

  // Database state is not updated while the transaction is ongoing
  assertEquals(password_1, password_2);

  // Transaction finishes, changes executed outside the transaction are now visible
  await transaction.commit();

  await client_1.release();
  await client_2.release();
  ```

- Serializable: Just like the repeatable read mode, all external changes won't
  be visible until the transaction has finished. However this also prevents the
  current transaction from making persistent changes if the data they were
  reading at the beginning of the transaction has been modified (recommended)
  ```ts
  const client_1 = await pool.connect();
  const client_2 = await pool.connect();

  const transaction = await client_1.createTransaction("isolated_transaction", {
    isolation_level: "serializable",
  });

  await transaction.begin();
  // This locks the current value of IMPORTANT_TABLE
  // Up to this point, all other external changes will be included
  await transaction.queryObject<{ password: string }>
    `SELECT PASSWORD FROM IMPORTANT_TABLE WHERE ID = ${my_id}`;

  // Concurrent operation executed by a different user in a different part of the code
  await client_2.queryArray
    `UPDATE IMPORTANT_TABLE SET PASSWORD = 'something_else' WHERE ID = ${the_same_id}`;

  // This statement will throw
  // Target was modified outside of the transaction
  // User may not be aware of the changes
  await transaction.queryArray
    `UPDATE IMPORTANT_TABLE SET PASSWORD = 'shiny_new_password' WHERE ID = ${the_same_id}`;

  // Transaction is aborted, no need to end it

  await client_1.release();
  await client_2.release();
  ```

##### Read modes

In many cases, and specially when allowing third parties to access data inside
your database it might be a good choice to prevent queries from modifying the
database in the course of the transaction. You can revoke this write privileges
by setting `read_only: true` in the transaction options. The default for all
transactions will be to enable write permission.

```ts
const transaction = await client.createTransaction("my_transaction", {
  read_only: true,
});
```

##### Snapshots

One of the most interesting features that Postgres transactions have it's the
ability to share starting point snapshots between them. For example, if you
initialized a repeatable read transaction before a particularly sensible change
in the database, and you would like to start several transactions with that same
before-the-change state you can do the following:

```ts
const snapshot = await ongoing_transaction.getSnapshot();

const new_transaction = client.createTransaction("new_transaction", {
  isolation_level: "repeatable_read",
  snapshot,
});
// new_transaction now shares the same starting state that ongoing_transaction had
```

#### Transaction features

##### Commit

Committing a transaction will persist all changes made inside it, releasing the
client from which the transaction spawned and allowing for normal operations to
take place.

```ts
const transaction = client.createTransaction("successful_transaction");
await transaction.begin();
await transaction.queryArray`TRUNCATE TABLE DELETE_ME`;
await transaction.queryArray`INSERT INTO DELETE_ME VALUES (1)`;
await transaction.commit(); // All changes are persisted, client is released
```

However, what if we intended to commit the previous changes without ending the
transaction? The `commit` method provides a `chain` option that allows us to
continue in the transaction after the changes have been persisted as
demonstrated here:

```ts
const transaction = client.createTransaction("successful_transaction");
await transaction.begin();

await transaction.queryArray`TRUNCATE TABLE DELETE_ME`;
await transaction.commit({ chain: true }); // Changes are committed

// Still inside the transaction
// Rolling back or aborting here won't affect the previous operation
await transaction.queryArray`INSERT INTO DELETE_ME VALUES (1)`;
await transaction.commit(); // Changes are committed, client is released
```

##### Savepoints

Savepoints are a powerful feature that allows us to keep track of transaction
operations, and if we want to, undo said specific changes without having to
reset the whole transaction.

```ts
const transaction = client.createTransaction("successful_transaction");
await transaction.begin();

await transaction.queryArray`INSERT INTO DONT_DELETE_ME VALUES (1)`;
const savepoint = await transaction.savepoint("before_delete");

await transaction.queryArray`TRUNCATE TABLE DONT_DELETE_ME`; // Oops, I didn't mean that
await transaction.rollback(savepoint); // Truncate is undone, insert is still applied

// Transaction goes on as usual
await transaction.commit();
```

A savepoint can also have multiple positions inside a transaction, and we can
accomplish that by using the `update` method of a savepoint.

```ts
await transaction.queryArray`INSERT INTO DONT_DELETE_ME VALUES (1)`;
const savepoint = await transaction.savepoint("before_delete");

await transaction.queryArray`TRUNCATE TABLE DONT_DELETE_ME`;
await savepoint.update(savepoint); // If I rollback savepoint now, it won't undo the truncate
```

However, if we wanted to undo one of these updates we could use the `release`
method in the savepoint to undo the last update and access the previous point of
that savepoint.

```ts
await transaction.queryArray`INSERT INTO DONT_DELETE_ME VALUES (1)`;
const savepoint = await transaction.savepoint("before_delete");

await transaction.queryArray`TRUNCATE TABLE DONT_DELETE_ME`;
await savepoint.update(savepoint); // Actually, I didn't meant this

await savepoint.release(); // The savepoint is again the first one we set
await transaction.rollback(savepoint); // Truncate gets undone
```

##### Rollback

A rollback allows the user to end the transaction without persisting the changes
made to the database, preventing that way any unwanted operation to take place.

```ts
const transaction = client.createTransaction("rolled_back_transaction");
await transaction.queryArray`TRUNCATE TABLE DONT_DELETE_ME`; // Oops, wrong table
await transaction.rollback(); // No changes are applied, transaction ends
```

You can also localize those changes to be undone using the savepoint feature as
explained above in the `Savepoint` documentation.

```ts
const transaction = client.createTransaction(
  "partially_rolled_back_transaction",
);
await transaction.savepoint("undo");
await transaction.queryArray`TRUNCATE TABLE DONT_DELETE_ME`; // Oops, wrong table
await transaction.rollback("undo"); // Truncate is rolled back, transaction continues
await transaction.end();
```

If we intended to rollback all changes but still continue in the current
transaction, we can use the `chain` option in a similar fashion to how we would
do it in the `commit` method.

```ts
const transaction = client.createTransaction("rolled_back_transaction");
await transaction.queryArray`INSERT INTO DONT_DELETE_ME VALUES (1)`;
await transaction.queryArray`TRUNCATE TABLE DONT_DELETE_ME`;
await transaction.rollback({ chain: true }); // All changes get undone
await transaction.queryArray`INSERT INTO DONT_DELETE_ME VALUES (2)`; // Still inside the transaction
await transaction.end();
```
