#! /usr/bin/env deno --allow-run
import { exit, args, run } from "deno";
import { parse } from "https://deno.land/x/flags/mod.ts";

async function main(opts) {
  const args = ["deno", "--allow-run", "--fmt", "--ignore", "lib"];

  if (opts.check) {
    args.push("--check");
  }

  const p = run({ args });

  const { code } = await p.status();

  exit(code);
}

main(parse(args));
