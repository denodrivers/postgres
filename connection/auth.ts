import { crypto, hex } from "../deps.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function md5(bytes: Uint8Array): Promise<string> {
  return decoder.decode(
    hex.encode(new Uint8Array(await crypto.subtle.digest("MD5", bytes))),
  );
}

// AuthenticationMD5Password
// The actual PasswordMessage can be computed in SQL as:
//  concat('md5', md5(concat(md5(concat(password, username)), random-salt))).
// (Keep in mind the md5() function returns its result as a hex string.)
export async function hashMd5Password(
  password: string,
  username: string,
  salt: Uint8Array,
): Promise<string> {
  const innerHash = await md5(encoder.encode(password + username));
  const innerBytes = encoder.encode(innerHash);
  const outerBuffer = new Uint8Array(innerBytes.length + salt.length);
  outerBuffer.set(innerBytes);
  outerBuffer.set(salt, innerBytes.length);
  const outerHash = await md5(outerBuffer);
  return "md5" + outerHash;
}
