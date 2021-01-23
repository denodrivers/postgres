#!/usr/bin/env -S deno test --fail-fast --allow-net --allow-env --allow-read=tests/config.json test.ts
import "./tests/data_types.ts";
import "./tests/queries.ts";
import "./tests/connection_params.ts";
import "./tests/client.ts";
import "./tests/pool.ts";
import "./tests/utils.ts";
