import { base64 } from "../deps.ts";

/** Number of random bytes used to generate a nonce */
const defaultNonceSize = 16;
const text_encoder = new TextEncoder();

enum AuthenticationState {
  Init,
  ClientChallenge,
  ServerChallenge,
  ClientResponse,
  ServerResponse,
  Failed,
}

/**
 * Collection of SCRAM authentication keys derived from a plaintext password
 * in HMAC-derived binary format
 */
interface KeySignatures {
  client: Uint8Array;
  server: Uint8Array;
  stored: Uint8Array;
}

/**
 * Reason of authentication failure
 */
export enum Reason {
  BadMessage = "server sent an ill-formed message",
  BadServerNonce = "server sent an invalid nonce",
  BadSalt = "server specified an invalid salt",
  BadIterationCount = "server specified an invalid iteration count",
  BadVerifier = "server sent a bad verifier",
  Rejected = "rejected by server",
}

function assert(cond: unknown): asserts cond {
  if (!cond) {
    throw new Error("Scram protocol assertion failed");
  }
}

// TODO
// Handle mapping and maybe unicode normalization.
// Add tests for invalid string values
/**
 * Normalizes string per SASLprep.
 * @see {@link https://tools.ietf.org/html/rfc3454}
 * @see {@link https://tools.ietf.org/html/rfc4013}
 */
function assertValidScramString(str: string) {
  const unsafe = /[^\x21-\x7e]/;
  if (unsafe.test(str)) {
    throw new Error(
      "scram username/password is currently limited to safe ascii characters",
    );
  }
}

async function computeScramSignature(
  message: string,
  raw_key: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    raw_key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  return new Uint8Array(
    await crypto.subtle.sign(
      { name: "HMAC", hash: "SHA-256" },
      key,
      text_encoder.encode(message),
    ),
  );
}

function computeScramProof(signature: Uint8Array, key: Uint8Array): Uint8Array {
  const digest = new Uint8Array(signature.length);
  for (let i = 0; i < digest.length; i++) {
    digest[i] = signature[i] ^ key[i];
  }
  return digest;
}

/**
 * Derives authentication key signatures from a plaintext password
 */
async function deriveKeySignatures(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<KeySignatures> {
  const pbkdf2_password = await crypto.subtle.importKey(
    "raw",
    text_encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      hash: "SHA-256",
      iterations,
      name: "PBKDF2",
      salt,
    },
    pbkdf2_password,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );

  const client = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, text_encoder.encode("Client Key")),
  );
  const server = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, text_encoder.encode("Server Key")),
  );
  const stored = new Uint8Array(await crypto.subtle.digest("SHA-256", client));

  return { client, server, stored };
}

/** Escapes "=" and "," in a string. */
function escape(str: string): string {
  return str
    .replace(/=/g, "=3D")
    .replace(/,/g, "=2C");
}

function generateRandomNonce(size: number): string {
  return base64.encode(crypto.getRandomValues(new Uint8Array(size)));
}

function parseScramAttributes(message: string): Record<string, string> {
  const attrs: Record<string, string> = {};

  for (const entry of message.split(",")) {
    const pos = entry.indexOf("=");
    if (pos < 1) {
      throw new Error(Reason.BadMessage);
    }

    // TODO
    // Replace with String.prototype.substring
    const key = entry.substr(0, pos);
    const value = entry.substr(pos + 1);
    attrs[key] = value;
  }

  return attrs;
}

/**
 * Client composes and verifies SCRAM authentication messages, keeping track
 * of authentication #state and parameters.
 * @see {@link https://tools.ietf.org/html/rfc5802}
 */
export class Client {
  #auth_message: string;
  #client_nonce: string;
  #key_signatures?: KeySignatures;
  #password: string;
  #server_nonce?: string;
  #state: AuthenticationState;
  #username: string;

  constructor(username: string, password: string, nonce?: string) {
    assertValidScramString(password);
    assertValidScramString(username);

    this.#auth_message = "";
    this.#client_nonce = nonce ?? generateRandomNonce(defaultNonceSize);
    this.#password = password;
    this.#state = AuthenticationState.Init;
    this.#username = escape(username);
  }

  /**
   * Composes client-first-message
   */
  composeChallenge(): string {
    assert(this.#state === AuthenticationState.Init);

    try {
      // "n" for no channel binding, then an empty authzid option follows.
      const header = "n,,";

      const challenge = `n=${this.#username},r=${this.#client_nonce}`;
      const message = header + challenge;

      this.#auth_message += challenge;
      this.#state = AuthenticationState.ClientChallenge;
      return message;
    } catch (e) {
      this.#state = AuthenticationState.Failed;
      throw e;
    }
  }

  /**
   * Processes server-first-message
   */
  async receiveChallenge(challenge: string) {
    assert(this.#state === AuthenticationState.ClientChallenge);

    try {
      const attrs = parseScramAttributes(challenge);

      const nonce = attrs.r;
      if (!attrs.r || !attrs.r.startsWith(this.#client_nonce)) {
        throw new Error(Reason.BadServerNonce);
      }
      this.#server_nonce = nonce;

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

      this.#key_signatures = await deriveKeySignatures(
        this.#password,
        salt,
        iterCount,
      );

      this.#auth_message += "," + challenge;
      this.#state = AuthenticationState.ServerChallenge;
    } catch (e) {
      this.#state = AuthenticationState.Failed;
      throw e;
    }
  }

  /**
   * Composes client-final-message
   */
  async composeResponse(): Promise<string> {
    assert(this.#state === AuthenticationState.ServerChallenge);
    assert(this.#key_signatures);
    assert(this.#server_nonce);

    try {
      // "biws" is the base-64 encoded form of the gs2-header "n,,".
      const responseWithoutProof = `c=biws,r=${this.#server_nonce}`;

      this.#auth_message += "," + responseWithoutProof;

      const proof = base64.encode(
        computeScramProof(
          await computeScramSignature(
            this.#auth_message,
            this.#key_signatures.stored,
          ),
          this.#key_signatures.client,
        ),
      );
      const message = `${responseWithoutProof},p=${proof}`;

      this.#state = AuthenticationState.ClientResponse;
      return message;
    } catch (e) {
      this.#state = AuthenticationState.Failed;
      throw e;
    }
  }

  /**
   * Processes server-final-message
   */
  async receiveResponse(response: string) {
    assert(this.#state === AuthenticationState.ClientResponse);
    assert(this.#key_signatures);

    try {
      const attrs = parseScramAttributes(response);

      if (attrs.e) {
        throw new Error(attrs.e ?? Reason.Rejected);
      }

      const verifier = base64.encode(
        await computeScramSignature(
          this.#auth_message,
          this.#key_signatures.server,
        ),
      );
      if (attrs.v !== verifier) {
        throw new Error(Reason.BadVerifier);
      }

      this.#state = AuthenticationState.ServerResponse;
    } catch (e) {
      this.#state = AuthenticationState.Failed;
      throw e;
    }
  }
}
