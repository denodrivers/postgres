import { assertEquals, assertNotEquals, assertThrows } from "./test_deps.ts";
import * as scram from "../connection/scram.ts";

Deno.test("scram.Client reproduces RFC 7677 example", () => {
  const client = new scram.Client("user", "pencil", "rOprNGfwEbeRWgbNEkqO");

  assertEquals(
    client.composeChallenge(),
    "n,,n=user,r=rOprNGfwEbeRWgbNEkqO",
  );
  client.receiveChallenge(
    "r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0," +
      "s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096",
  );
  assertEquals(
    client.composeResponse(),
    "c=biws,r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0," +
      "p=dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=",
  );
  client.receiveResponse(
    "v=6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=",
  );
});

Deno.test("scram.Client catches bad server nonce", () => {
  const testCases = [
    "s=c2FsdA==,i=4096",
    "r=,s=c2FsdA==,i=4096",
    "r=nonce2,s=c2FsdA==,i=4096",
  ];
  for (const testCase of testCases) {
    const client = new scram.Client("user", "password", "nonce1");
    client.composeChallenge();
    assertThrows(() => client.receiveChallenge(testCase));
  }
});

Deno.test("scram.Client catches bad salt", () => {
  const testCases = [
    "r=nonce12,i=4096",
    "r=nonce12,s=*,i=4096",
  ];
  for (const testCase of testCases) {
    const client = new scram.Client("user", "password", "nonce1");
    client.composeChallenge();
    assertThrows(() => client.receiveChallenge(testCase));
  }
});

Deno.test("scram.Client catches bad iteration count", () => {
  const testCases = [
    "r=nonce12,s=c2FsdA==",
    "r=nonce12,s=c2FsdA==,i=",
    "r=nonce12,s=c2FsdA==,i=*",
    "r=nonce12,s=c2FsdA==,i=0",
    "r=nonce12,s=c2FsdA==,i=-1",
  ];
  for (const testCase of testCases) {
    const client = new scram.Client("user", "password", "nonce1");
    client.composeChallenge();
    assertThrows(() => client.receiveChallenge(testCase));
  }
});

Deno.test("scram.Client catches bad verifier", () => {
  const client = new scram.Client("user", "password", "nonce1");
  client.composeChallenge();
  client.receiveChallenge("r=nonce12,s=c2FsdA==,i=4096");
  client.composeResponse();
  assertThrows(() => client.receiveResponse("v=xxxx"));
});

Deno.test("scram.Client catches server rejection", () => {
  const client = new scram.Client("user", "password", "nonce1");
  client.composeChallenge();
  client.receiveChallenge("r=nonce12,s=c2FsdA==,i=4096");
  client.composeResponse();
  assertThrows(() => client.receiveResponse("e=auth error"));
});

Deno.test("scram.Client generates unique challenge", () => {
  const challenge1 = new scram.Client("user", "password").composeChallenge();
  const challenge2 = new scram.Client("user", "password").composeChallenge();
  assertNotEquals(challenge1, challenge2);
});
