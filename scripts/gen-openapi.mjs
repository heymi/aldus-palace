#!/usr/bin/env node
/**
 * Emit `spec/openapi.json` from the HTTP route registrations plus the metadata
 * table below, so the API can be read (and consumed by tools) without a
 * TypeScript toolchain.
 *
 * Every registered route must have an entry, so a new route fails the check
 * until it is documented.
 *
 * Usage: node scripts/gen-openapi.mjs [--check]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "spec/openapi.json");

const sources = [
  { file: "apps/server/src/routes/inputs.ts", base: "/v1/inputs" },
  { file: "apps/server/src/routes/lists.ts", base: "/v1" },
];

/** method + path → { summary, tag, request?, response? } */
const meta = {
  "POST /v1/inputs": {
    summary: "Capture an input and process it",
    tag: "Inputs",
    request: {
      type: "object",
      required: ["content"],
      properties: {
        content: { type: "string", description: "The user's words." },
        mode: { type: "string", enum: ["progressive", "local", "sync"] },
      },
    },
    response: "CaptureOutcome",
  },
  "POST /v1/inputs/{id}/enrich": { summary: "Run the model pass under an enrichment lease", tag: "Inputs" },
  "POST /v1/inputs/{id}/process": { summary: "Process a raw input that is still pending", tag: "Inputs", response: "CaptureOutcome" },
  "GET /v1/inputs/{id}": { summary: "Read a raw input and its derived objects", tag: "Inputs" },
  "GET /v1/me": { summary: "The current user", tag: "Account" },
  "GET /v1/thoughts": { summary: "List thoughts", tag: "Thoughts", response: "Thought" },
  "POST /v1/thoughts/rewrite-summaries": { summary: "Rewrite thought titles", tag: "Thoughts" },
  "GET /v1/thoughts/{id}": { summary: "Read a thought", tag: "Thoughts", response: "Thought" },
  "PATCH /v1/thoughts/{id}": { summary: "Update a thought", tag: "Thoughts", response: "Thought" },
  "DELETE /v1/thoughts/{id}": { summary: "Delete a thought", tag: "Thoughts" },
  "POST /v1/thoughts/{id}/convert-to-commitment": { summary: "Turn a thought into a commitment", tag: "Thoughts", response: "Commitment" },
  "GET /v1/commitments": { summary: "List commitments, optionally by status", tag: "Commitments", response: "Commitment" },
  "PATCH /v1/commitments/{id}": { summary: "Update a commitment", tag: "Commitments", response: "Commitment" },
  "DELETE /v1/commitments/{id}": { summary: "Delete a commitment", tag: "Commitments" },
  "POST /v1/commitments/{id}/start": { summary: "Mark a commitment started", tag: "Commitments", response: "Commitment" },
  "POST /v1/commitments/{id}/complete": { summary: "Complete a commitment", tag: "Commitments", response: "Commitment" },
  "POST /v1/commitments/{id}/cancel": { summary: "Cancel a commitment", tag: "Commitments", response: "Commitment" },
  "POST /v1/commitments/{id}/arrange-today": { summary: "Arrange a commitment for today", tag: "Planning" },
  "POST /v1/commitments/{id}/remove-from-today": { summary: "Return a commitment to unscheduled work", tag: "Planning" },
  "POST /v1/commitments/rewrite-titles": { summary: "Rewrite commitment titles into executable form", tag: "Commitments" },
  "POST /v1/commitments/dedupe": { summary: "Collapse duplicate commitments", tag: "Commitments" },
  "GET /v1/today": { summary: "The Today projection: now, timeline, risks, unscheduled", tag: "Planning", response: "Today" },
  "POST /v1/plan/today": { summary: "Reconcile the Today plan (migrates slipped work first)", tag: "Planning", response: "Today" },
  "POST /v1/plan/migrate": { summary: "Move slipped, flexible work forward", tag: "Planning", response: "MigrationResult" },
  "GET /v1/work-streams": { summary: "Commitments grouped into rebuildable work streams", tag: "Work streams", response: "WorkStreams" },
  "POST /v1/commitment-classifications/rebuild": { summary: "Rebuild the work-stream projection", tag: "Work streams" },
  "PATCH /v1/commitments/{id}/classification": { summary: "Move a commitment to another work stream", tag: "Work streams" },
  "GET /v1/commitments/{id}/dependencies": { summary: "What a commitment waits on", tag: "Commitments", response: "DependencyList" },
  "POST /v1/commitments/{id}/dependencies": {
    summary: "Make a commitment wait on another",
    tag: "Commitments",
    request: {
      type: "object",
      required: ["blocked_by_id"],
      properties: { blocked_by_id: { type: "string" } },
    },
    response: "DependencyList",
  },
  "DELETE /v1/commitments/{id}/dependencies/{blockedById}": { summary: "Remove a dependency", tag: "Commitments", response: "DependencyList" },
  "GET /v1/memories": { summary: "List memories by state", tag: "Memory", response: "Memory" },
  "PATCH /v1/memories/{id}": { summary: "Update a memory", tag: "Memory", response: "Memory" },
  "DELETE /v1/memories/{id}": { summary: "Delete a memory", tag: "Memory" },
  "POST /v1/memories/{id}/confirm": {
    summary: "Confirm a memory candidate, optionally replacing an older belief",
    tag: "Memory",
    request: {
      type: "object",
      properties: {
        concept_names: { type: "array", items: { type: "string" } },
        supersedes: { type: "string", description: "Id of the belief this one replaces." },
        reason: { type: "string" },
      },
    },
    response: "Memory",
  },
  "POST /v1/memories/{id}/reject": { summary: "Archive a memory", tag: "Memory", response: "Memory" },
  "POST /v1/memories/dedupe": { summary: "Collapse duplicate memories", tag: "Memory" },
  "GET /v1/memories/{id}/versions": { summary: "The version chain of a memory", tag: "Memory", response: "Memory" },
  "GET /v1/concepts": { summary: "List concepts", tag: "Concepts", response: "Concept" },
  "POST /v1/concepts": { summary: "Create a concept", tag: "Concepts", response: "Concept" },
  "GET /v1/concepts/{id}": { summary: "Read a concept", tag: "Concepts", response: "Concept" },
  "GET /v1/projects": { summary: "List projects", tag: "Projects", response: "Project" },
  "POST /v1/projects": { summary: "Create a project", tag: "Projects", response: "Project" },
  "GET /v1/projects/{id}": { summary: "Read a project", tag: "Projects", response: "Project" },
  "PATCH /v1/projects/{id}": { summary: "Update a project", tag: "Projects", response: "Project" },
  "DELETE /v1/projects/{id}": { summary: "Delete a project", tag: "Projects" },
  "POST /v1/projects/{id}/relink": { summary: "Relink objects to a project", tag: "Projects" },
  "GET /v1/clarifications": { summary: "Open time clarifications", tag: "Clarifications", response: "Clarification" },
  "POST /v1/clarifications/{id}/resolve": { summary: "Answer a time clarification", tag: "Clarifications" },
  "GET /v1/activity": { summary: "The action log", tag: "Activity", response: "ActionLog" },
  "GET /v1/actions": { summary: "Agent actions proposed, waiting and decided", tag: "Actions", response: "ActionProposal" },
  "GET /v1/autonomy": { summary: "The trust score and autonomy level derived from decided actions", tag: "Actions", response: "AutonomyState" },
  "POST /v1/autonomy": {
    summary: "Set how far earned trust may widen autonomy",
    tag: "Actions",
    request: {
      type: "object",
      required: ["ceiling"],
      properties: { ceiling: { type: "integer", enum: [2, 3, 4] } },
    },
    response: "AutonomyState",
  },
  "POST /v1/actions/{id}/decide": {
    summary: "Approve or reject a waiting action; a critical action needs two approvals",
    tag: "Actions",
    request: {
      type: "object",
      required: ["decision"],
      properties: {
        decision: { type: "string", enum: ["approve", "reject"] },
        reason: { type: "string" },
      },
    },
    response: "ActionProposal",
  },
  "POST /v1/actions/{id}/revoke": {
    summary: "Revoke a proposal or an approval",
    tag: "Actions",
    request: {
      type: "object",
      properties: { reason: { type: "string" } },
    },
    response: "ActionProposal",
  },
};

function parseRoutes() {
  const found = new Map();
  for (const source of sources) {
    const text = readFileSync(path.join(root, source.file), "utf8");
    const pattern = /\.(get|post|put|patch|delete)\("([^"]+)"/g;
    for (const match of text.matchAll(pattern)) {
      const method = match[1].toUpperCase();
      const relative = match[2] === "/" ? "" : match[2];
      const full = (source.base + relative).replace(/\/$/, "") || "/";
      const openapiPath = full.replace(/:([A-Za-z_]+)/g, "{$1}");
      found.set(`${method} ${openapiPath}`, { method, path: openapiPath });
    }
  }
  return found;
}

function responseFor(name) {
  if (!name) return { description: "OK", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } };
  return { description: "OK", content: { "application/json": { schema: { $ref: `#/components/schemas/${name}` } } } };
}

const routes = parseRoutes();
const missing = [...routes.keys()].filter((key) => !meta[key]);
if (missing.length) {
  console.error("Undocumented routes:\n" + missing.map((m) => `  ${m}`).join("\n"));
  process.exit(1);
}

const paths = {};
for (const [key, route] of [...routes.entries()].sort()) {
  const entry = meta[key];
  paths[route.path] ??= {};
  paths[route.path][route.method.toLowerCase()] = {
    summary: entry.summary,
    tags: [entry.tag],
    ...(entry.request
      ? { requestBody: { required: true, content: { "application/json": { schema: entry.request } } } }
      : {}),
    responses: {
      200: responseFor(entry.response),
      400: { description: "Bad request", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      404: { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
    },
  };
}

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Aldus Palace HTTP API",
    version: "0.x",
    description:
      "The HTTP surface of the auditable memory layer. Bearer token auth; the same schema as the library and the MCP server.",
  },
  servers: [{ url: "http://localhost:8787", description: "local reference server" }],
  security: [{ bearerAuth: [] }],
  paths,
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
    },
    schemas: {
      Error: { type: "object", properties: { error: { type: "string" } }, required: ["error"] },
      CaptureOutcome: {
        type: "object",
        properties: {
          id: { type: "string" },
          processing_status: { type: "string" },
          stage: { type: "string" },
          action_card: { $ref: "#/components/schemas/ActionCard" },
        },
      },
      ActionCard: {
        type: "object",
        properties: {
          summary: { type: "string" },
          thoughts: { type: "array", items: { type: "object", additionalProperties: true } },
          commitments: { type: "array", items: { $ref: "#/components/schemas/Commitment" } },
          decisions: { type: "array", items: { type: "object", additionalProperties: true } },
          memory_candidates: { type: "array", items: { $ref: "#/components/schemas/Memory" } },
          clarifications: { type: "array", items: { $ref: "#/components/schemas/Clarification" } },
          warnings: { type: "array", items: { type: "string" } },
        },
        required: ["summary"],
      },
      Commitment: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          goal: { type: ["string", "null"] },
          status: { type: "string", enum: ["captured", "planned", "scheduled", "completed", "cancelled", "risk"] },
          deadline: { type: ["string", "null"], format: "date-time" },
          window_start: { type: ["string", "null"], format: "date-time" },
          window_end: { type: ["string", "null"], format: "date-time" },
          ai_slot_start: { type: ["string", "null"], format: "date-time" },
          ai_slot_end: { type: ["string", "null"], format: "date-time" },
          duration_minutes: { type: ["integer", "null"] },
          importance: { type: ["number", "null"] },
        },
        required: ["id", "title", "status"],
      },
      Thought: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["idea", "insight", "observation", "research", "decision_candidate"] },
          title: { type: ["string", "null"] },
          content: { type: "string" },
          status: { type: "string", enum: ["captured", "exploring", "converted", "archived"] },
        },
        required: ["id", "content"],
      },
      Memory: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["preference", "project_context", "principle", "decision", "experience"] },
          content: { type: "string" },
          status: { type: "string", enum: ["candidate", "active", "superseded", "archived"] },
          activation_note: { type: ["string", "null"] },
          evidence: { type: ["string", "null"] },
          confidence: { type: ["number", "null"] },
          importance: { type: ["number", "null"] },
        },
        required: ["id", "content", "status"],
      },
      Project: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          status: { type: ["string", "null"] },
        },
        required: ["id", "name"],
      },
      Concept: {
        type: "object",
        properties: { id: { type: "string" }, name: { type: "string" } },
        required: ["id", "name"],
      },
      Clarification: {
        type: "object",
        properties: {
          id: { type: "string" },
          kind: { type: "string" },
          prompt: { type: "string" },
          options: { type: "array", items: { type: "object", additionalProperties: true } },
        },
        required: ["id", "prompt"],
      },
      Today: {
        type: "object",
        properties: {
          date_key: { type: "string" },
          timezone: { type: "string" },
          now: { type: ["object", "null"], additionalProperties: true },
          timeline: { type: "array", items: { type: "object", additionalProperties: true } },
          risks: { type: "array", items: { $ref: "#/components/schemas/Commitment" } },
          unscheduled: { type: "array", items: { $ref: "#/components/schemas/Commitment" } },
          unscheduled_total: { type: "integer" },
          summary: { type: "string" },
          plan: {
            type: "object",
            description: "The morning classification of the day's work.",
            properties: {
              core: { type: "array", items: { type: "string" } },
              optional: { type: "array", items: { type: "string" } },
              deferred: { type: "array", items: { type: "string" } },
            },
          },
          planning: { type: "object", additionalProperties: true },
        },
        required: ["date_key", "summary"],
      },
      DependencyList: {
        type: "object",
        properties: {
          blocked_by: {
            type: "array",
            items: { type: "string" },
            description: "Commitment ids that must complete first.",
          },
        },
        required: ["blocked_by"],
      },
      MigrationResult: {
        type: "object",
        properties: {
          migrated: { type: "array", items: { type: "object", additionalProperties: true } },
          needs_confirmation: {
            type: "array",
            items: { type: "object", additionalProperties: true },
            description: "Deferred three times: they wait for a decision instead of moving again.",
          },
        },
        required: ["migrated", "needs_confirmation"],
      },
      WorkStreams: {
        type: "object",
        properties: {
          groups: { type: "array", items: { type: "object", additionalProperties: true } },
          unassigned: { type: "array", items: { type: "object", additionalProperties: true } },
          total: { type: "integer" },
        },
      },
      ActionLog: {
        type: "object",
        properties: {
          id: { type: "string" },
          actor: { type: "string" },
          action_type: { type: "string" },
          summary: { type: "string" },
          reason: { type: ["string", "null"] },
          created_at: { type: "string", format: "date-time" },
        },
      },
      AutonomyState: {
        type: "object",
        properties: {
          score: { type: "number", description: "Laplace-smoothed approval rate, 0..1." },
          approvals: { type: "integer" },
          rejections: { type: "integer" },
          samples: { type: "integer" },
          level: { type: "integer", minimum: 0, maximum: 4, description: "The level the record earned." },
          ceiling: { type: "integer", minimum: 2, maximum: 4 },
          effective_level: {
            type: "integer",
            minimum: 0,
            maximum: 4,
            description: "min(max(level, 2), ceiling) — what the gate applies.",
          },
        },
        required: ["score", "level", "ceiling", "effective_level"],
      },
      ActionProposal: {
        type: "object",
        properties: {
          id: { type: "string" },
          action_type: { type: "string" },
          payload: { type: "string", description: "JSON-encoded action payload." },
          risk: { type: "string", enum: ["low", "medium", "high", "critical"] },
          status: {
            type: "string",
            enum: ["approved", "notified", "proposed", "pending_second", "rejected", "revoked"],
          },
          actor: { type: "string", enum: ["user", "agent"] },
          reason: { type: ["string", "null"] },
          decided_by: { type: ["string", "null"] },
          decided_at: { type: ["string", "null"], format: "date-time" },
          confirmations: { type: "integer" },
        },
        required: ["id", "action_type", "risk", "status"],
      },
    },
  },
};

const actionCardTarget = path.join(root, "spec/action-card.schema.json");
const actionCardSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/heymi/aldus-palace/spec/action-card.schema.json",
  title: "ActionCard",
  description:
    "What a capture returns: the summary, the typed objects, the memory candidates and the warnings. Generated from the same components as spec/openapi.json.",
  type: "object",
  properties: {
    summary: { type: "string" },
    thoughts: { type: "array", items: { type: "object", additionalProperties: true } },
    commitments: { type: "array", items: { $ref: "#/$defs/Commitment" } },
    decisions: { type: "array", items: { type: "object", additionalProperties: true } },
    memory_candidates: { type: "array", items: { $ref: "#/$defs/Memory" } },
    memory_conflicts: { type: "array", items: { type: "object", additionalProperties: true } },
    clarifications: { type: "array", items: { $ref: "#/$defs/Clarification" } },
    project_match: { type: ["object", "null"], additionalProperties: true },
    project_suggestion: { type: ["object", "null"], additionalProperties: true },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "thoughts", "commitments", "decisions", "memory_candidates", "clarifications", "warnings"],
  $defs: {
    Commitment: spec.components.schemas.Commitment,
    Memory: spec.components.schemas.Memory,
    Clarification: spec.components.schemas.Clarification,
  },
};

const text = JSON.stringify(spec, null, 2) + "\n";
const actionCardText = JSON.stringify(actionCardSchema, null, 2) + "\n";

if (process.argv.includes("--check")) {
  const current = existsSync(target) ? readFileSync(target, "utf8") : "";
  const currentCard = existsSync(actionCardTarget)
    ? readFileSync(actionCardTarget, "utf8")
    : "";
  if (current !== text || currentCard !== actionCardText) {
    console.error("spec/openapi.json or spec/action-card.schema.json is out of date. Run: pnpm gen:openapi");
    process.exit(1);
  }
  console.log(`spec/openapi.json is up to date (${routes.size} routes).`);
  process.exit(0);
}

writeFileSync(target, text);
writeFileSync(actionCardTarget, actionCardText);
console.log(`Wrote ${path.relative(root, target)} and spec/action-card.schema.json (${routes.size} routes)`);
