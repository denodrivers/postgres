import { base64, HmacSha256 } from "../deps.ts";

function assert(cond: unknown): asserts cond {
  if (!cond) {
    throw new Error("assertion failed");
  }
}

/** Reason of authentication failure. */
export enum Reason {
  BadMessage = "server sent an ill-formed message",
  BadServerNonce = "server sent an invalid nonce",
  BadSalt = "server specified an invalid salt",
  BadIterationCount = "server specified an invalid iteration count",
  BadVerifier = "server sent a bad verifier",
  Rejected = "rejected by server",
}

/** SCRAM authentication state. */
enum State {
  Init,
  ClientChallenge,
  ServerChallenge,
  ClientResponse,
  ServerResponse,
  Failed,
}

/** Number of random bytes used to generate a nonce. */
const defaultNonceSize = 16;

/**
 * Client composes and verifies SCRAM authentication messages, keeping track
 * of authentication #state and parameters.
 * @see {@link https://tools.ietf.org/html/rfc5802}
 */
export class Client {
  #authMessage: string;
  #clientNonce: string;
  #keys?: Keys;
  #password: string;
  #serverNonce?: string;
  #state: State;
  #username: string;

  /** Constructor sets credentials and parameters used in an authentication. */
  constructor(username: string, password: string, nonce?: string) {
    this.#username = username;
    this.#password = password;
    this.#clientNonce = nonce ?? generateNonce(defaultNonceSize);
    this.#authMessage = "";
    this.#state = State.Init;
  }

  /** Composes client-first-message. */
  composeChallenge(): string {
    assert(this.#state === State.Init);

    try {
      // "n" for no channel binding, then an empty authzid option follows.
      const header = "n,,";

      const username = escape(normalize(this.#username));
      const challenge = `n=${username},r=${this.#clientNonce}`;
      const message = header + challenge;

      this.#authMessage += challenge;
      this.#state = State.ClientChallenge;
      return message;
    } catch (e) {
      this.#state = State.Failed;
      throw e;
    }
  }

  /** Processes server-first-message. */
  async receiveChallenge(challenge: string) {
    assert(this.#state === State.ClientChallenge);

    try {
      const attrs = parseAttributes(challenge);

      const nonce = attrs.r;
      if (!attrs.r || !attrs.r.startsWith(this.#clientNonce)) {
        throw new Error(Reason.BadServerNonce);
      }
      this.#serverNonce = nonce;

      let salt: Uint8Array | undefined;
      if (!attrs.s) {
        throw new Error(Reason.BadSalt);
      }
      try {
        salt = base64.decode(attrs.s);
      } catch {
        throw new Error(Reason.BadSalt);
      }

      const iterCount = parseInt(attrs.i) | 0;
      if (iterCount <= 0) {
        throw new Error(Reason.BadIterationCount);
      }

      this.#keys = await deriveKeys(this.#password, salt, iterCount);

      this.#authMessage += "," + challenge;
      this.#state = State.ServerChallenge;
    } catch (e) {
      this.#state = State.Failed;
      throw e;
    }
  }

  /** Composes client-final-message. */
  async composeResponse(): Promise<string> {
    assert(this.#state === State.ServerChallenge);
    assert(this.#keys);
    assert(this.#serverNonce);

    try {
      // "biws" is the base-64 encoded form of the gs2-header "n,,".
      const responseWithoutProof = `c=biws,r=${this.#serverNonce}`;

      this.#authMessage += "," + responseWithoutProof;

      const proof = base64.encode(
        computeProof(
          await computeSignature(this.#authMessage, this.#keys.stored),
          this.#keys.client,
        ),
      );
      const message = `${responseWithoutProof},p=${proof}`;

      this.#state = State.ClientResponse;
      return message;
    } catch (e) {
      this.#state = State.Failed;
      throw e;
    }
  }

  /** Processes server-final-message. */
  async receiveResponse(response: string) {
    assert(this.#state === State.ClientResponse);
    assert(this.#keys);

    try {
      const attrs = parseAttributes(response);

      if (attrs.e) {
        throw new Error(attrs.e ?? Reason.Rejected);
      }

      const verifier = base64.encode(
        await computeSignature(this.#authMessage, this.#keys.server),
      );
      if (attrs.v !== verifier) {
        throw new Error(Reason.BadVerifier);
      }

      this.#state = State.ServerResponse;
    } catch (e) {
      this.#state = State.Failed;
      throw e;
    }
  }
}

/** Generates a random nonce string. */
function generateNonce(size: number): string {
  return base64.encode(crypto.getRandomValues(new Uint8Array(size)));
}

/** Parses attributes out of a SCRAM message. */
function parseAttributes(str: string): Record<string, string> {
  const attrs: Record<string, string> = {};

  for (const entry of str.split(",")) {
    const pos = entry.indexOf("=");
    if (pos < 1) {
      throw new Error(Reason.BadMessage);
    }

    const key = entry.substr(0, pos);
    const value = entry.substr(pos + 1);
    attrs[key] = value;
  }

  return attrs;
}

/** HMAC-derived binary key. */
type Key = Uint8Array;

/** Binary digest. */
type Digest = Uint8Array;

/** Collection of SCRAM authentication keys derived from a plaintext password. */
interface Keys {
  server: Key;
  client: Key;
  stored: Key;
}

/** Derives authentication keys from a plaintext password. */
async function deriveKeys(
  password: string,
  salt: Uint8Array,
  iterCount: number,
): Promise<Keys> {
  const ikm = bytes(normalize(password));
  const key = await pbkdf2(
    (msg: Uint8Array) => sign(msg, ikm),
    salt,
    iterCount,
    1,
  );
  const server = await sign(bytes("Server Key"), key);
  const client = await sign(bytes("Client Key"), key);
  const stored = new Uint8Array(await crypto.subtle.digest("SHA-256", client));
  return { server, client, stored };
}

/** Computes SCRAM signature. */
function computeSignature(message: string, key: Key): Promise<Digest> {
  return sign(bytes(message), key);
}

/** Computes SCRAM proof. */
function computeProof(signature: Digest, key: Key): Digest {
  const proof = new Uint8Array(signature.length);
  for (let i = 0; i < proof.length; i++) {
    proof[i] = signature[i] ^ key[i];
  }
  return proof;
}

/** Returns UTF-8 bytes encoding given string. */
function bytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Normalizes string per SASLprep.
 * @see {@link https://tools.ietf.org/html/rfc3454}
 * @see {@link https://tools.ietf.org/html/rfc4013}
 */
function normalize(str: string): string {
  // TODO: Handle mapping and maybe unicode normalization.
  const unsafe = /[^\x21-\x7e]/;
  if (unsafe.test(str)) {
    throw new Error(
      "scram username/password is currently limited to safe ascii characters",
    );
  }
  return str;
}

/** Escapes "=" and "," in a string. */
function escape(str: string): string {
  return str
    .replace(/=/g, "=3D")
    .replace(/,/g, "=2C");
}

/** Computes HMAC of a message using given key. */
// TODO
// Migrate to crypto.subtle.sign on Deno 1.11
// deno-lint-ignore require-await
async function sign(msg: Uint8Array, key: Key): Promise<Digest> {
  const hmac = new HmacSha256(key);
  hmac.update(msg);
  return new Uint8Array(hmac.arrayBuffer());
}

/**
 * Computes a PBKDF2 key block.
 * @see {@link https://tools.ietf.org/html/rfc2898}
 */
async function pbkdf2(
  prf: (_: Uint8Array) => Promise<Digest>,
  salt: Uint8Array,
  iterCount: number,
  index: number,
): Promise<Key> {
  let block = new Uint8Array(salt.length + 4);
  block.set(salt);
  block[salt.length + 0] = (index >> 24) & 0xFF;
  block[salt.length + 1] = (index >> 16) & 0xFF;
  block[salt.length + 2] = (index >> 8) & 0xFF;
  block[salt.length + 3] = index & 0xFF;
  block = await prf(block);

  const key = block;
  for (let r = 1; r < iterCount; r++) {
    block = await prf(block);
    for (let i = 0; i < key.length; i++) {
      key[i] ^= block[i];
    }
  }
  return key;
}
