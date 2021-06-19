import {
  assertEquals,
  assertNotEquals,
  assertThrowsAsync,
} from "./test_deps.ts";
import * as scram from "../connection/scram.ts";

Deno.test("scram.Client reproduces RFC 7677 example", async () => {
  // Example seen in https://tools.ietf.org/html/rfc7677
  const client = new scram.Client("user", "pencil", "rOprNGfwEbeRWgbNEkqO");

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

Deno.test("scram.Client catches bad server nonce", async () => {
  const testCases = [
    "s=c2FsdA==,i=4096", // no server nonce
    "r=,s=c2FsdA==,i=4096", // empty
    "r=nonce2,s=c2FsdA==,i=4096", // not prefixed with client nonce
  ];
  for (const testCase of testCases) {
    const client = new scram.Client("user", "password", "nonce1");
    client.composeChallenge();
    await assertThrowsAsync(() => client.receiveChallenge(testCase));
  }
});

Deno.test("scram.Client catches bad salt", async () => {
  const testCases = [
    "r=nonce12,i=4096", // no salt
    "r=nonce12,s=*,i=4096", // ill-formed base-64 string
  ];
  for (const testCase of testCases) {
    const client = new scram.Client("user", "password", "nonce1");
    client.composeChallenge();
    await assertThrowsAsync(() => client.receiveChallenge(testCase));
  }
});

Deno.test("scram.Client catches bad iteration count", async () => {
  const testCases = [
    "r=nonce12,s=c2FsdA==", // no iteration count
    "r=nonce12,s=c2FsdA==,i=", // empty
    "r=nonce12,s=c2FsdA==,i=*", // not a number
    "r=nonce12,s=c2FsdA==,i=0", // non-positive integer
    "r=nonce12,s=c2FsdA==,i=-1", // non-positive integer
  ];
  for (const testCase of testCases) {
    const client = new scram.Client("user", "password", "nonce1");
    client.composeChallenge();
    await assertThrowsAsync(() => client.receiveChallenge(testCase));
  }
});

Deno.test("scram.Client catches bad verifier", async () => {
  const client = new scram.Client("user", "password", "nonce1");
  client.composeChallenge();
  await client.receiveChallenge("r=nonce12,s=c2FsdA==,i=4096");
  await client.composeResponse();
  await assertThrowsAsync(() => client.receiveResponse("v=xxxx"));
});

Deno.test("scram.Client catches server rejection", async () => {
  const client = new scram.Client("user", "password", "nonce1");
  client.composeChallenge();
  await client.receiveChallenge("r=nonce12,s=c2FsdA==,i=4096");
  await client.composeResponse();
  await assertThrowsAsync(() => client.receiveResponse("e=auth error"));
});

Deno.test("scram.Client generates unique challenge", () => {
  const challenge1 = new scram.Client("user", "password").composeChallenge();
  const challenge2 = new scram.Client("user", "password").composeChallenge();
  assertNotEquals(challenge1, challenge2);
});
