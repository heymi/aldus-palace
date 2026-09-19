#!/usr/bin/env node
/**
 * Emit `llms-full.txt` — the key documents concatenated for LLM ingestion.
 *
 * Usage: node scripts/gen-llms-full.mjs [--check]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "llms-full.txt");

const sources = [
  "README.md",
  "EVALUATION.md",
  "docs/ARCHITECTURE.md",
  "docs/DOMAIN-SCHEMA.md",
  "docs/CAPABILITIES.md",
  "docs/INTELLIGENCE.md",
  "docs/EVAL.md",
  "docs/POSITIONING.md",
  "docs/MAP.md",
  "docs/GLOSSARY.md",
  "docs/BENCHMARKS.md",
  "docs/BENCHMARKS-LLM.md",
  "ROADMAP.md",
];

const header = `# Aldus Palace — full documentation

GENERATED FILE — do not edit.
Regenerate: pnpm gen:llms
Source: ${sources.join(", ")}

`;

const parts = [header];
for (const source of sources) {
  const absolute = path.join(root, source);
  if (!existsSync(absolute)) {
    console.error(`Missing source document: ${source}`);
    process.exit(1);
  }
  const body = readFileSync(absolute, "utf8").trim();
  parts.push(`\n\n<!-- ${source} -->\n\n${body}\n`);
}
const text = parts.join("").replace(/\n{4,}/g, "\n\n\n");

if (process.argv.includes("--check")) {
  const current = existsSync(target) ? readFileSync(target, "utf8") : "";
  if (current !== text) {
    console.error("llms-full.txt is out of date. Run: pnpm gen:llms");
    process.exit(1);
  }
  console.log("llms-full.txt is up to date.");
  process.exit(0);
}

writeFileSync(target, text);
console.log(`Wrote ${path.relative(root, target)} (${text.length} bytes)`);
