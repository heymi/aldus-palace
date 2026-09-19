#!/usr/bin/env node
/**
 * Capture committed evidence: the real output of the demo, the suites, the
 * fixtures and the benchmark, plus an asciinema cast of the demo. Useful for
 * readers (and AI tools) that cannot run the repository.
 *
 * Usage: pnpm evidence
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "examples/output");
mkdirSync(outputDir, { recursive: true });

function run(command) {
  return execSync(command, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
    .replace(/\u001b\[[0-9;]*m/g, "")
    .trimEnd();
}

function write(file, command, body) {
  const header = `# GENERATED FILE — do not edit.\n# Regenerate: pnpm evidence\n# Command: ${command}\n\n`;
  writeFileSync(path.join(outputDir, file), header + body + "\n");
  console.log(`Wrote examples/output/${file}`);
}

const demo = run("pnpm demo");
write("demo.txt", "pnpm demo", demo);
write("test.txt", "pnpm test", run("pnpm test"));
write("eval.txt", "pnpm eval", run("pnpm eval"));
write("bench.txt", "pnpm bench", run("pnpm bench"));

const cast = [
  JSON.stringify({
    version: 2,
    width: 100,
    height: 30,
    timestamp: 0,
    env: { SHELL: "/bin/sh", TERM: "xterm-256color" },
  }),
  JSON.stringify([0.1, "o", "$ pnpm demo\r\n"]),
  JSON.stringify([0.6, "o", demo.replace(/\n/g, "\r\n") + "\r\n"]),
].join("\n");
writeFileSync(path.join(root, "docs/assets/demo.cast"), cast + "\n");
console.log("Wrote docs/assets/demo.cast");
