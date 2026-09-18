/**
 * Test runner for the reference server: executes every `*.test.ts` in this
 * directory as its own process.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const files = fs
  .readdirSync(here)
  .filter((file) => file.endsWith(".test.ts"))
  .sort();

let failed = 0;
for (const file of files) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", path.join(here, file)],
    { stdio: "inherit" }
  );
  if (result.status === 0) {
    console.log(`PASS ${file}`);
  } else {
    failed += 1;
    console.error(`FAIL ${file}`);
  }
}

console.log(
  failed === 0
    ? `\nAll ${files.length} suites passed.`
    : `\n${failed} of ${files.length} suites failed.`
);
process.exit(failed === 0 ? 0 : 1);
