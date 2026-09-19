#!/usr/bin/env node
/**
 * Documentation guards:
 *
 * 1. Every relative link in the docs resolves to a file.
 * 2. Every suite/fixture count in the docs matches the repository, including the
 *    per-package "All N suites passed." fragments in the evaluation samples.
 * 3. Every route count matches spec/openapi.json.
 *
 * Usage: node scripts/check-docs.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function walk(dir) {
  const absolute = path.join(root, dir);
  if (!existsSync(absolute)) return [];
  const entries = readdirSync(absolute);
  const files = [];
  for (const entry of entries) {
    const relative = path.join(dir, entry);
    const full = path.join(root, relative);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "design-archive") continue;
      files.push(...walk(relative));
    } else if (entry.endsWith(".md")) {
      files.push(relative);
    }
  }
  return files;
}

const markdown = [
  "README.md",
  "README.zh.md",
  "EVALUATION.md",
  "EVALUATION.zh.md",
  "AGENTS.md",
  "CLAUDE.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "ROADMAP.md",
  "GOVERNANCE.md",
  "CODE_OF_CONDUCT.md",
  ...walk("docs"),
  ...walk("packages"),
  ...walk("apps"),
  ...walk("examples"),
];

const linkPattern = /\]\(([^)\s]+)\)/g;
for (const file of [...new Set(markdown)]) {
  const absolute = path.join(root, file);
  if (!existsSync(absolute)) continue;
  const text = readFileSync(absolute, "utf8");
  for (const match of text.matchAll(linkPattern)) {
    const raw = match[1];
    if (/^(https?:|mailto:|#)/.test(raw)) continue;
    const target = raw.split("#")[0];
    if (!target) continue;
    const resolved = target.startsWith("/")
      ? path.join(root, target.slice(1))
      : path.resolve(path.dirname(absolute), target);
    if (!existsSync(resolved)) {
      failures.push(`${file}: broken link → ${raw}`);
    }
  }
}

const packageTestFiles = readdirSync(path.join(root, "packages")).flatMap((pkg) => {
  const dir = path.join(root, "packages", pkg, "test");
  return existsSync(dir)
    ? readdirSync(dir).filter((file) => file.endsWith(".test.ts"))
    : [];
});
const suiteFiles = [
  ...packageTestFiles,
  ...readdirSync(path.join(root, "apps/server/test")).filter((f) => f.endsWith(".test.ts")),
];
const suites = suiteFiles.length;
const fixtures = readdirSync(path.join(root, "eval/fixtures")).filter((f) => f.endsWith(".json")).length;

const suitesByDir = new Map(
  ["packages/core", "packages/mcp", "packages/client", "apps/server"].map((dir) => {
    const testDir = path.join(root, dir, "test");
    const count = existsSync(testDir)
      ? readdirSync(testDir).filter((file) => file.endsWith(".test.ts")).length
      : 0;
    return [dir, count];
  })
);

const openapi = JSON.parse(readFileSync(path.join(root, "spec/openapi.json"), "utf8"));
const operations = Object.values(openapi.paths).reduce(
  (total, pathItem) => total + Object.keys(pathItem).length,
  0
);

const counted = [
  "EVALUATION.md",
  "EVALUATION.zh.md",
  "README.md",
  "README.zh.md",
  "packages/core/README.md",
  "docs/POSITIONING.md",
  "docs/assets/capture-session.svg",
];
for (const file of counted) {
  const absolute = path.join(root, file);
  if (!existsSync(absolute)) continue;
  const text = readFileSync(absolute, "utf8");
  for (const line of text.split("\n")) {
    // Per-package output fragments describe one package, not the total: check
    // each against that package's own count instead of skipping the line.
    const fragment = line.match(/^(\S+) test: All (\d+) suites passed\./);
    if (fragment) {
      const expected = suitesByDir.get(fragment[1]);
      if (expected !== undefined && Number(fragment[2]) !== expected) {
        failures.push(
          `${file}: sample says ${fragment[1]} has ${fragment[2]} suites, repository has ${expected}`
        );
      }
      continue;
    }
    if (/test:|All \d+ suites/.test(line)) continue;
    for (const match of line.matchAll(
      /(\d+)\s+(?:test\s+)?suites|(\d+)\s*个\s*(?:测试\s*)?套件/g
    )) {
      const value = Number(match[1] ?? match[2]);
      if (value !== suites) {
        failures.push(`${file}: says ${value} suites, repository has ${suites}`);
      }
    }
    for (const match of line.matchAll(
      /(\d+)\s+(?:acceptance\s+)?fixtures|(\d+)\s*个\s*(?:验收\s*)?fixture/g
    )) {
      const value = Number(match[1] ?? match[2]);
      if (value !== fixtures) {
        failures.push(`${file}: says ${value} fixtures, repository has ${fixtures}`);
      }
    }
  }
}

// Route counts in prose must match the generated OpenAPI document.
const routeCounted = [
  "docs/CAPABILITIES.md",
  "docs/capabilities/08-http-api.md",
  "README.md",
  "README.zh.md",
];
for (const file of routeCounted) {
  const absolute = path.join(root, file);
  if (!existsSync(absolute)) continue;
  const text = readFileSync(absolute, "utf8");
  for (const match of text.matchAll(/(\d+)\s+(?:REST\s+)?(?:routes|operations)|(\d+)\s*个路由/g)) {
    const value = Number(match[1] ?? match[2]);
    if (value !== operations) {
      failures.push(`${file}: says ${value} routes, spec/openapi.json has ${operations}`);
    }
  }
}

if (failures.length) {
  console.error("Documentation check failed:");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`Documentation check passed (${suites} suites, ${fixtures} fixtures).`);
