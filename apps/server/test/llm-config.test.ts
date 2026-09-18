import assert from "node:assert/strict";
import fs from "node:fs";
import { DEFAULT_OPENAI_COMPATIBLE_MODEL } from "@aldus-palace/core/providers";

const supportedModels = new Set([
  "deepseek-chat",
  "deepseek-v4-pro",
  "deepseek-v4-flash",
]);

const wrangler = JSON.parse(
  fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")
) as { vars?: { DEEPSEEK_MODEL?: string } };
const deployedModel = wrangler.vars?.DEEPSEEK_MODEL;

assert.ok(
  supportedModels.has(DEFAULT_OPENAI_COMPATIBLE_MODEL),
  `unsupported default model: ${DEFAULT_OPENAI_COMPATIBLE_MODEL}`
);
assert.equal(
  deployedModel,
  DEFAULT_OPENAI_COMPATIBLE_MODEL,
  "wrangler and code must use the same default model"
);

console.log("llm config tests passed");
