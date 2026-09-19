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

function structuredOf(result: unknown): unknown {
  return (result as { structuredContent?: unknown }).structuredContent;
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
  resolveProfile({}, ["node", "aldus-palace-mcp-actions"]) === "actions",
  "the actions bin selects the action gate profile"
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
assert(tools.length === 10, `full profile exposes ten tools, got ${tools.length}`);
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
const capturedCard = textOf(captured);
assert(capturedCard.includes("Captured"), `the card leads with the receipt: ${capturedCard}`);
assert(capturedCard.includes("commitment"), `the card names the object: ${capturedCard}`);
const card = structuredOf(captured) as {
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
assert(
  textOf(today).startsWith("Today ·"),
  `the Today card leads with the date: ${textOf(today)}`
);
const todayPayload = structuredOf(today) as {
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
//
// A stated rule with high confidence takes effect on capture. A weaker signal
// waits as a candidate. Both are reversible.

const statedCapture = await client.callTool({
  name: "capture",
  arguments: { content: "以后产品不要做太复杂，保持克制。", mode: "local" },
});
assert(!statedCapture.isError, `memory capture failed: ${textOf(statedCapture)}`);
const statedCard = structuredOf(statedCapture) as {
  action_card: { memory_candidates: Array<{ id: string; status: string }> };
};
const stated = statedCard.action_card.memory_candidates[0];
assert(stated !== undefined, "a stated rule yields a memory");
assert(
  stated!.status === "active",
  `a high-confidence stated rule takes effect on capture, got ${stated!.status}`
);

const active = await client.callTool({
  name: "list_memories",
  arguments: { state: "active" },
});
const activeRows = JSON.parse(textOf(active)) as Array<{
  id: string;
  activation: string;
  activation_note: string;
}>;
assert(activeRows.length >= 1, "the remembered rule is listed as active");
assert(
  activeRows.some((row) => row.id === stated!.id),
  "the captured rule is the active memory"
);
assert(
  activeRows.every((row) => row.activation_note.length > 0),
  "every memory explains why it is active"
);
assert(
  activeRows.some((row) => row.id === stated!.id && row.activation === "auto"),
  `a memory stored during a capture is marked auto, got ${JSON.stringify(activeRows.map((r) => [r.id, r.activation]))}`
);

// A weaker signal waits for confirmation.
const candidateCapture = await client.callTool({
  name: "capture",
  arguments: { content: "保持 Mac-only，不做 Windows 版", mode: "local" },
});
assert(!candidateCapture.isError, `candidate capture failed: ${textOf(candidateCapture)}`);
const candidateCard = structuredOf(candidateCapture) as {
  action_card: { memory_candidates: Array<{ id: string; status: string }> };
};
const candidate = candidateCard.action_card.memory_candidates[0];
assert(candidate !== undefined, "the weaker signal yields a memory");
assert(
  candidate!.status === "candidate",
  `a signal below the threshold waits, got ${candidate!.status}`
);

const candidates = await client.callTool({
  name: "list_memories",
  arguments: { state: "candidate" },
});
assert(
  (JSON.parse(textOf(candidates)) as Array<{ id: string }>).some(
    (row) => row.id === candidate!.id
  ),
  "the candidate is listed as pending"
);

const confirmed = await client.callTool({
  name: "confirm_memory",
  arguments: { memory_id: candidate!.id },
});
assert(!confirmed.isError, `confirm_memory failed: ${textOf(confirmed)}`);
const confirmedPayload = JSON.parse(textOf(confirmed)) as {
  memory: { status: string };
};
assert(confirmedPayload.memory.status === "active", "confirmation activates the memory");

// Archiving works on a memory the system stored on its own.
const rejected = await client.callTool({
  name: "reject_memory",
  arguments: { memory_id: stated!.id },
});
assert(!rejected.isError, `reject_memory failed: ${textOf(rejected)}`);
const rejectedPayload = JSON.parse(textOf(rejected)) as {
  previous_status: string;
};
assert(
  rejectedPayload.previous_status === "active",
  `archiving records the prior state, got ${rejectedPayload.previous_status}`
);

const afterReject = await client.callTool({
  name: "list_memories",
  arguments: { state: "active" },
});
assert(
  (JSON.parse(textOf(afterReject)) as Array<{ id: string }>).every(
    (row) => row.id !== stated!.id
  ),
  "the archived memory leaves the active list"
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

// action gate
//
// The queue starts empty; a decision on an unknown proposal is a tool error.
const actions = await client.callTool({ name: "list_actions", arguments: {} });
assert(!actions.isError, `list_actions failed: ${textOf(actions)}`);
assert(
  textOf(actions).startsWith("Actions ·"),
  `the action card leads with the queue: ${textOf(actions)}`
);
const actionItems = structuredOf(actions) as {
  items: unknown[];
  autonomy: {
    level: number;
    effective_level: number;
    ceiling: number;
    score: number;
    samples: number;
  };
};
assert(actionItems.items.length === 0, "no action waits by default");
assert(actionItems.autonomy.level === 0, "no decisions means no earned level");
assert(actionItems.autonomy.ceiling === 2, "the default ceiling is the published baseline");
assert(actionItems.autonomy.effective_level === 2, "the baseline applies");
assert(actionItems.autonomy.samples === 0, "no decisions are counted yet");
assert(
  textOf(actions).includes("Trust 0.50 · level 2"),
  `the card carries the effective level: ${textOf(actions)}`
);

const decideMissing = await client.callTool({
  name: "decide_action",
  arguments: { proposal_id: "act_missing", decision: "approve" },
});
assert(decideMissing.isError === true, "an unknown proposal returns a tool error");

const revokeMissing = await client.callTool({
  name: "revoke_action",
  arguments: { proposal_id: "act_missing" },
});
assert(revokeMissing.isError === true, "an unknown proposal cannot be revoked");

await client.close();
await server.close();
backend.close();

console.log("mcp tool tests passed.");
