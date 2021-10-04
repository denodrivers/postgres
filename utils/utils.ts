import { bold, yellow } from "../deps.ts";

export function readInt16BE(buffer: Uint8Array, offset: number): number {
  offset = offset >>> 0;
  const val = buffer[offset + 1] | (buffer[offset] << 8);
  return val & 0x8000 ? val | 0xffff0000 : val;
}

export function readUInt16BE(buffer: Uint8Array, offset: number): number {
  offset = offset >>> 0;
  return buffer[offset] | (buffer[offset + 1] << 8);
}

export function readInt32BE(buffer: Uint8Array, offset: number): number {
  offset = offset >>> 0;

  return (
    (buffer[offset] << 24) |
    (buffer[offset + 1] << 16) |
    (buffer[offset + 2] << 8) |
    buffer[offset + 3]
  );
}

export function readUInt32BE(buffer: Uint8Array, offset: number): number {
  offset = offset >>> 0;

  return (
    buffer[offset] * 0x1000000 +
    ((buffer[offset + 1] << 16) |
      (buffer[offset + 2] << 8) |
      buffer[offset + 3])
  );
}

export interface DsnResult {
  driver: string;
  user: string;
  password: string;
  hostname: string;
  port: string;
  database: string;
  params: {
    [key: string]: string;
  };
}

export function parseDsn(dsn: string): DsnResult {
  //URL object won't parse the URL if it doesn't recognize the protocol
  //This line replaces the protocol with http and then leaves it up to URL
  const [protocol, strippedUrl] = dsn.match(/(?:(?!:\/\/).)+/g) ?? ["", ""];
  const url = new URL(`http:${strippedUrl}`);

  let password = url.password;
  // Special characters in the password may be url-encoded by URL(), such as =
  try {
    password = decodeURIComponent(password);
  } catch (_e) {
    console.error(
      bold(
        yellow("Failed to decode URL password") +
          "\nDefaulting to raw password",
      ),
    );
  }

  return {
    password,
    driver: protocol,
    user: url.username,
    hostname: url.hostname,
    port: url.port,
    // remove leading slash from path
    database: url.pathname.slice(1),
    params: Object.fromEntries(url.searchParams.entries()),
  };
}

export function isTemplateString(
  template: unknown,
): template is TemplateStringsArray {
  if (!Array.isArray(template)) {
    return false;
  }
  return true;
}
