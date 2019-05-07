#! /usr/bin/env deno run --allow-run
import { parse } from "https://deno.land/x/flags/mod.ts";

const { exit, args, run } = Deno;

async function main(opts) {
  const args = ["deno", "fmt", "--", "--ignore", "lib"];

  if (opts.check) {
    args.push("--check");
  }

  const p = run({ args });

  const { code } = await p.status();

  exit(code);
}

main(parse(args));
