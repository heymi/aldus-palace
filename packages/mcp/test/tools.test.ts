import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { LocalBackend } from "../src/backend.js";
import { registerPrompts, registerTools } from "../src/tools.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> })
    .content;
  return (content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
}

const backend = await LocalBackend.open({
  databasePath: ":memory:",
  user: { name: "Tester", timezone: "Asia/Tokyo", language: "en" },
  provider: { LLM_PROVIDER: "dev" },
});
assert(backend.description.startsWith("local SQLite"), "local backend selected");

const server = new McpServer({ name: "aldus-palace-test", version: "0.0.0" });
registerTools(server, backend);
registerPrompts(server);

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);

const client = new Client({ name: "test-client", version: "0.0.0" });
await client.connect(clientTransport);

// --- surface ---------------------------------------------------------------

const { tools } = await client.listTools();
const names = tools.map((tool) => tool.name).sort();
assert(
  JSON.stringify(names) ===
    JSON.stringify([
      "capture",
      "confirm_memory",
      "list_commitments",
      "list_memories",
      "list_today",
    ]),
  `unexpected tool surface: ${names.join(", ")}`
);
for (const tool of tools) {
  assert(!!tool.description, `${tool.name} must document itself`);
}

const { prompts } = await client.listPrompts();
const promptNames = prompts.map((prompt) => prompt.name).sort();
assert(
  JSON.stringify(promptNames) === JSON.stringify(["capture", "today"]),
  `unexpected prompt surface: ${promptNames.join(", ")}`
);
const capturePrompt = await client.getPrompt({
  name: "capture",
  arguments: { content: "Ship the onboarding page" },
});
const promptText = (capturePrompt.messages[0]!.content as { text: string }).text;
assert(
  promptText.includes("capture") && promptText.includes("Ship the onboarding page"),
  "the capture prompt must instruct the model and carry the user input"
);

// --- capture ---------------------------------------------------------------

const captured = await client.callTool({
  name: "capture",
  arguments: {
    content: "Ship the onboarding page next week",
    mode: "local",
  },
});
assert(!captured.isError, `capture failed: ${textOf(captured)}`);
const card = JSON.parse(textOf(captured)) as {
  id: string;
  processing_status: string;
  action_card: { commitments: Array<{ title: string }> };
};
assert(card.id.startsWith("inp_"), "capture returns the raw input id");
assert(
  card.processing_status === "local",
  "mode=local produces a deterministic local result"
);
assert(
  card.action_card.commitments.length >= 1,
  "an actionable capture must produce a commitment"
);

// --- reads -----------------------------------------------------------------

const today = await client.callTool({ name: "list_today", arguments: {} });
assert(!today.isError, `list_today failed: ${textOf(today)}`);
const todayPayload = JSON.parse(textOf(today)) as {
  date_key: string;
  unscheduled: unknown[];
};
assert(/^\d{4}-\d{2}-\d{2}$/.test(todayPayload.date_key), "today carries a date key");
assert(todayPayload.unscheduled.length >= 1, "the new commitment is visible as work");

const commitments = await client.callTool({
  name: "list_commitments",
  arguments: {},
});
assert(!commitments.isError, `list_commitments failed: ${textOf(commitments)}`);
const commitmentRows = JSON.parse(textOf(commitments)) as Array<{ id: string }>;
assert(commitmentRows.length >= 1, "the commitment is listed");

const planned = await client.callTool({
  name: "list_commitments",
  arguments: { status: "planned" },
});
assert(
  (JSON.parse(textOf(planned)) as Array<{ id: string }>).length >= 1,
  "the status filter matches a scheduled-by-date commitment"
);

// --- memory lifecycle ------------------------------------------------------

const memoryCapture = await client.callTool({
  name: "capture",
  arguments: { content: "以后产品不要做太复杂，保持克制。", mode: "local" },
});
assert(!memoryCapture.isError, `memory capture failed: ${textOf(memoryCapture)}`);

const candidates = await client.callTool({
  name: "list_memories",
  arguments: { status: "candidate" },
});
const candidateRows = JSON.parse(textOf(candidates)) as Array<{ id: string }>;
assert(candidateRows.length >= 1, "a principle capture yields a memory candidate");

const confirmed = await client.callTool({
  name: "confirm_memory",
  arguments: { memory_id: candidateRows[0]!.id },
});
assert(!confirmed.isError, `confirm_memory failed: ${textOf(confirmed)}`);
const confirmedMemory = JSON.parse(textOf(confirmed)) as { status: string };
assert(confirmedMemory.status === "active", "confirmation activates the memory");

const active = await client.callTool({
  name: "list_memories",
  arguments: { status: "active" },
});
assert(
  (JSON.parse(textOf(active)) as unknown[]).length >= 1,
  "the active memory is listed"
);

// --- failure surfaces as a tool error, not a crash -------------------------

const missing = await client.callTool({
  name: "confirm_memory",
  arguments: { memory_id: "mem_does_not_exist" },
});
assert(missing.isError === true, "unknown memory ids return a tool error");

await client.close();
await server.close();

console.log("mcp tool tests passed.");
