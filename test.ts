#! /usr/bin/env deno run --allow-net --allow-env test.ts
import { runTests } from "./test_deps.ts";

import "./tests/data_types.ts";
import "./tests/queries.ts";
import "./tests/connection_params.ts";
import "./tests/client.ts";
import "./tests/pool.ts";
import "./tests/utils.ts";

runTests();
