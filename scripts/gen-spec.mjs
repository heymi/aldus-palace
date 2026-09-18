#!/usr/bin/env node
/**
 * Emit `spec/schema.sql` from the canonical `SCHEMA_SQL` constant so the
 * schema can be read (and diffed) without a TypeScript toolchain.
 *
 * Usage: node scripts/gen-spec.mjs [--check]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "packages/core/src/db/schema.ts");
const target = path.join(root, "spec/schema.sql");

const header = `-- GENERATED FILE — do not edit.
-- Source: packages/core/src/db/schema.ts
-- Regenerate: pnpm gen:spec
`;

const ts = readFileSync(source, "utf8");
const match = ts.match(/export const SCHEMA_SQL = `\n([\s\S]*?)`;\n?$/);
if (!match) {
  console.error("Could not find SCHEMA_SQL in", source);
  process.exit(1);
}
const sql = header + match[1].replace(/\\`/g, "`").replace(/\\\$\{/g, "${");

if (process.argv.includes("--check")) {
  const current = existsSync(target) ? readFileSync(target, "utf8") : "";
  if (current !== sql) {
    console.error("spec/schema.sql is out of date. Run: pnpm gen:spec");
    process.exit(1);
  }
  console.log("spec/schema.sql is up to date.");
  process.exit(0);
}

writeFileSync(target, sql);
console.log(`Wrote ${path.relative(root, target)} (${sql.length} bytes)`);
