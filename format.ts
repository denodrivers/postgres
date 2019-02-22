#! /usr/bin/env deno --allow-run
import { exit, run } from "deno";

async function main() {
  const args = ["deno", "--allow-run", "--fmt"];

  const p = run({ args });

  const { code } = await p.status();

  exit(code);
}

main();
