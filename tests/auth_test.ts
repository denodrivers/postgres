import {
  assertEquals,
  assertNotEquals,
  assertThrowsAsync,
} from "./test_deps.ts";
import { Client as ScramClient, Reason } from "../connection/scram.ts";

Deno.test("Scram client reproduces RFC 7677 example", async () => {
  // Example seen in https://tools.ietf.org/html/rfc7677
  const client = new ScramClient("user", "pencil", "rOprNGfwEbeRWgbNEkqO");

  assertEquals(
    client.composeChallenge(),
    "n,,n=user,r=rOprNGfwEbeRWgbNEkqO",
  );
  await client.receiveChallenge(
    "r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0," +
      "s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096",
  );
  assertEquals(
    await client.composeResponse(),
    "c=biws,r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0," +
      "p=dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=",
  );
  await client.receiveResponse(
    "v=6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=",
  );
});

Deno.test("Scram client catches bad server nonce", async () => {
  const testCases = [
    "s=c2FsdA==,i=4096", // no server nonce
    "r=,s=c2FsdA==,i=4096", // empty
    "r=nonce2,s=c2FsdA==,i=4096", // not prefixed with client nonce
  ];
  for (const testCase of testCases) {
    const client = new ScramClient("user", "password", "nonce1");
    client.composeChallenge();
    await assertThrowsAsync(
      () => client.receiveChallenge(testCase),
      Error,
      Reason.BadServerNonce,
    );
  }
});

Deno.test("Scram client catches bad salt", async () => {
  const testCases = [
    "r=nonce12,i=4096", // no salt
    "r=nonce12,s=*,i=4096", // ill-formed base-64 string
  ];
  for (const testCase of testCases) {
    const client = new ScramClient("user", "password", "nonce1");
    client.composeChallenge();
    await assertThrowsAsync(
      () => client.receiveChallenge(testCase),
      Error,
      Reason.BadSalt,
    );
  }
});

Deno.test("Scram client catches bad iteration count", async () => {
  const testCases = [
    "r=nonce12,s=c2FsdA==", // no iteration count
    "r=nonce12,s=c2FsdA==,i=", // empty
    "r=nonce12,s=c2FsdA==,i=*", // not a number
    "r=nonce12,s=c2FsdA==,i=0", // non-positive integer
    "r=nonce12,s=c2FsdA==,i=-1", // non-positive integer
  ];
  for (const testCase of testCases) {
    const client = new ScramClient("user", "password", "nonce1");
    client.composeChallenge();
    await assertThrowsAsync(
      () => client.receiveChallenge(testCase),
      Error,
      Reason.BadIterationCount,
    );
  }
});

Deno.test("Scram client catches bad verifier", async () => {
  const client = new ScramClient("user", "password", "nonce1");
  client.composeChallenge();
  await client.receiveChallenge("r=nonce12,s=c2FsdA==,i=4096");
  await client.composeResponse();
  await assertThrowsAsync(
    () => client.receiveResponse("v=xxxx"),
    Error,
    Reason.BadVerifier,
  );
});

Deno.test("Scram client catches server rejection", async () => {
  const client = new ScramClient("user", "password", "nonce1");
  client.composeChallenge();
  await client.receiveChallenge("r=nonce12,s=c2FsdA==,i=4096");
  await client.composeResponse();

  const message = "auth error";
  await assertThrowsAsync(
    () => client.receiveResponse(`e=${message}`),
    Error,
    message,
  );
});

Deno.test("Scram client generates unique challenge", () => {
  const challenge1 = new ScramClient("user", "password").composeChallenge();
  const challenge2 = new ScramClient("user", "password").composeChallenge();
  assertNotEquals(challenge1, challenge2);
});
