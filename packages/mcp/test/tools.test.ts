import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { LocalBackend } from "../src/backend.js";
import { PROFILES, registerPrompts, registerTools, type Profile } from "../src/tools.js";
import { resolveProfile } from "../src/index.js";

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

async function connect(profile: Profile) {
  const backend = await LocalBackend.open({
    databasePath: ":memory:",
    user: { name: "Tester", timezone: "Asia/Tokyo", language: "en" },
    provider: { LLM_PROVIDER: "dev" },
  });
  const server = new McpServer({ name: `aldus-palace-${profile}`, version: "0.0.0" });
  registerTools(server, backend, profile);
  registerPrompts(server);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return { client, server, backend };
}

// --- profile resolution ----------------------------------------------------

assert(resolveProfile({}, ["node", "aldus-palace-mcp"]) === "full", "default bin ⇒ full");
assert(
  resolveProfile({}, ["node", "aldus-palace-mcp-today"]) === "today",
  "bin name selects the profile"
);
assert(
  resolveProfile({ ALDUS_PALACE_PROFILE: "memory" }, ["node", "aldus-palace-mcp"]) ===
    "memory",
  "env overrides the bin default"
);
assert(
  resolveProfile({ ALDUS_PALACE_PROFILE: "nonsense" }, ["node", "aldus-palace-mcp"]) ===
    "full",
  "an unknown profile falls back to full"
);

// --- focused profiles expose focused surfaces ------------------------------

for (const [profile, expected] of Object.entries(PROFILES)) {
  const { client, server, backend } = await connect(profile as Profile);
  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name).sort();
  const want = [...expected].sort();
  assert(
    JSON.stringify(names) === JSON.stringify(want),
    `profile ${profile}: expected [${want.join(", ")}], got [${names.join(", ")}]`
  );
  await client.close();
  await server.close();
  backend.close();
}

// --- full surface behaviour ------------------------------------------------

const { client, server, backend } = await connect("full");

const { tools } = await client.listTools();
assert(tools.length === 6, `full profile exposes six tools, got ${tools.length}`);
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

// capture
const captured = await client.callTool({
  name: "capture",
  arguments: { content: "Ship the onboarding page next week", mode: "local" },
});
assert(!captured.isError, `capture failed: ${textOf(captured)}`);
const card = JSON.parse(textOf(captured)) as {
  id: string;
  processing_status: string;
  action_card: { commitments: Array<{ title: string }>; memory_conflicts?: unknown[] };
};
assert(card.id.startsWith("inp_"), "capture returns the raw input id");
assert(card.processing_status === "local", "mode=local is deterministic");
assert(card.action_card.commitments.length >= 1, "an actionable capture creates work");
assert(Array.isArray(card.action_card.memory_conflicts), "conflicts are always reported");

// today + commitments
const today = await client.callTool({ name: "list_today", arguments: {} });
assert(!today.isError, `list_today failed: ${textOf(today)}`);
const todayPayload = JSON.parse(textOf(today)) as {
  date_key: string;
  unscheduled: unknown[];
};
assert(/^\d{4}-\d{2}-\d{2}$/.test(todayPayload.date_key), "today carries a date key");
assert(todayPayload.unscheduled.length >= 1, "new work shows up as unscheduled");

const commitments = await client.callTool({ name: "list_commitments", arguments: {} });
const commitmentRows = JSON.parse(textOf(commitments)) as Array<{ id: string }>;
assert(commitmentRows.length >= 1, "the commitment is listed");

const planned = await client.callTool({
  name: "list_commitments",
  arguments: { status: "planned" },
});
assert(
  (JSON.parse(textOf(planned)) as Array<{ id: string }>).length >= 1,
  "the status filter matches a dated commitment"
);

// work streams
const streams = await client.callTool({
  name: "list_work_streams",
  arguments: { limit_per_group: 5 },
});
assert(!streams.isError, `list_work_streams failed: ${textOf(streams)}`);
const streamPayload = JSON.parse(textOf(streams)) as {
  groups: Array<{ key: string; label: string; commitments: unknown[] }>;
  total: number;
};
assert(streamPayload.total >= 1, "work streams see the commitments");
assert(
  streamPayload.groups.every((group) => Array.isArray(group.commitments)),
  "each stream carries its commitments"
);

// memory lifecycle
const memoryCapture = await client.callTool({
  name: "capture",
  arguments: { content: "以后产品不要做太复杂，保持克制。", mode: "local" },
});
assert(!memoryCapture.isError, `memory capture failed: ${textOf(memoryCapture)}`);

const candidates = await client.callTool({
  name: "list_memories",
  arguments: { state: "candidate" },
});
const candidateRows = JSON.parse(textOf(candidates)) as Array<{ id: string }>;
assert(candidateRows.length >= 1, "a principle capture yields a memory candidate");

const confirmed = await client.callTool({
  name: "confirm_memory",
  arguments: { memory_id: candidateRows[0]!.id },
});
assert(!confirmed.isError, `confirm_memory failed: ${textOf(confirmed)}`);
const confirmedPayload = JSON.parse(textOf(confirmed)) as {
  memory: { status: string };
};
assert(confirmedPayload.memory.status === "active", "confirmation activates the memory");

const active = await client.callTool({
  name: "list_memories",
  arguments: { state: "active" },
});
assert(
  (JSON.parse(textOf(active)) as unknown[]).length >= 1,
  "the active memory is listed"
);

const superseded = await client.callTool({
  name: "list_memories",
  arguments: { state: "superseded" },
});
assert(!superseded.isError, `superseded listing failed: ${textOf(superseded)}`);
assert(
  (JSON.parse(textOf(superseded)) as unknown[]).length === 0,
  "nothing is superseded yet"
);

const missing = await client.callTool({
  name: "confirm_memory",
  arguments: { memory_id: "mem_does_not_exist" },
});
assert(missing.isError === true, "unknown memory ids return a tool error");

await client.close();
await server.close();
backend.close();

console.log("mcp tool tests passed.");
