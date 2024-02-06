import { walk } from "https://deno.land/std@0.214.0/fs/walk.ts";
import denoConfig from "../deno.json" with { type: "json" };

const STD_SPECIFIER_REGEX = /https:\/\/deno\.land\/std@(\d+\.\d+\.\d+)\/(\w+)\/(.+)\.ts/g;
const POSTGRES_X_SPECIFIER = "https://deno.land/x/postgres/mod.ts";
const POSTGRES_JSR_SPECIFIER = `jsr:${denoConfig.name}`;

function toStdJsrSpecifier(_full: string, version: string, module: string, path: string): string {
  return path === "mod"
    ? `jsr:@std/${module}@${version}`
    : `jsr:@std/${module}@${version}/${path}`;
}

for await (
  const entry of walk(".", {
    includeDirs: false,
    exts: [".ts", ".md"],
    skip: [/docker/, /.github/],
    followSymlinks: false,
  })
) {
  const text = await Deno.readTextFile(entry.path);
  const newText = text
    .replaceAll(STD_SPECIFIER_REGEX, toStdJsrSpecifier)
    .replaceAll(POSTGRES_X_SPECIFIER, POSTGRES_JSR_SPECIFIER);
  await Deno.writeTextFile(entry.path, newText);
}
