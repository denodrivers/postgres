import { ConnectionOptions } from "../connection/connection_params.ts";

const file = "config.json";
const path = new URL("config.json", import.meta.url);

let content = "{}";
try {
  content = await Deno.readTextFile(path);
} catch (e) {
  if (e instanceof Deno.errors.NotFound) {
    console.log(
      `"${file}" wasn't found in the tests directory, using environmental variables`,
    );
  } else {
    throw e;
  }
}

const config: ConnectionOptions = JSON.parse(content);

export default config;
