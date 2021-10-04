import { createHash } from "../deps.ts";

const encoder = new TextEncoder();

function md5(bytes: Uint8Array): string {
  return createHash("md5").update(bytes).toString("hex");
}

// AuthenticationMD5Password
// The actual PasswordMessage can be computed in SQL as:
//  concat('md5', md5(concat(md5(concat(password, username)), random-salt))).
// (Keep in mind the md5() function returns its result as a hex string.)
export function hashMd5Password(
  password: string,
  username: string,
  salt: Uint8Array,
): string {
  const innerHash = md5(encoder.encode(password + username));
  const innerBytes = encoder.encode(innerHash);
  const outerBuffer = new Uint8Array(innerBytes.length + salt.length);
  outerBuffer.set(innerBytes);
  outerBuffer.set(salt, innerBytes.length);
  const outerHash = md5(outerBuffer);
  return "md5" + outerHash;
}
