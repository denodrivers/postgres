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

export interface Uri {
  driver: string;
  host: string;
  password: string;
  path: string;
  params: Record<string, string>;
  port: string;
  user: string;
}

/**
 * This function parses valid connection strings according to https://www.postgresql.org/docs/14/libpq-connect.html#LIBPQ-CONNSTRING
 *
 * The only exception to this rule are multi-host connection strings
 */
export function parseConnectionUri(uri: string): Uri {
  const parsed_uri = uri.match(
    /(?<driver>\w+):\/{2}((?<user>[^\/?#\s:]+?)?(:(?<password>[^\/?#\s]+)?)?@)?(?<full_host>[^\/?#\s]+)?(\/(?<path>[^?#\s]*))?(\?(?<params>[^#\s]+))?.*/,
  );
  if (!parsed_uri) throw new Error("Could not parse the provided URL");
  let {
    driver = "",
    full_host = "",
    params = "",
    password = "",
    path = "",
    user = "",
  }: {
    driver?: string;
    user?: string;
    password?: string;
    full_host?: string;
    path?: string;
    params?: string;
  } = parsed_uri.groups ?? {};

  const parsed_host = full_host.match(
    /(?<host>(\[.+\])|(.*?))(:(?<port>[\w]*))?$/,
  );
  if (!parsed_host) throw new Error(`Could not parse "${full_host}" host`);
  let {
    host = "",
    port = "",
  }: {
    host?: string;
    port?: string;
  } = parsed_host.groups ?? {};

  try {
    if (host) {
      host = decodeURIComponent(host);
    }
  } catch (_e) {
    console.error(
      bold(
        yellow("Failed to decode URL host") + "\nDefaulting to raw host",
      ),
    );
  }

  if (port && Number.isNaN(Number(port))) {
    throw new Error(`The provided port "${port}" is not a valid number`);
  }

  try {
    if (password) {
      password = decodeURIComponent(password);
    }
  } catch (_e) {
    console.error(
      bold(
        yellow("Failed to decode URL password") +
          "\nDefaulting to raw password",
      ),
    );
  }

  return {
    driver,
    host,
    params: Object.fromEntries(new URLSearchParams(params).entries()),
    password,
    path,
    port,
    user,
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

/**
 * https://www.postgresql.org/docs/14/runtime-config-connection.html#RUNTIME-CONFIG-CONNECTION-SETTINGS
 * unix_socket_directories
 */
export const getSocketName = (port: number) => `.s.PGSQL.${port}`;
