import {
  decayHalfLifeDays,
  decayWeight,
  memoryLevelFor,
  memoryRetrievalScore,
  memoryValueScore,
} from "../src/lib/memoryValue.js";
import { retrieveActiveMemoriesForContext } from "../src/lib/concepts.js";
import { createTestDb, finish } from "./support/db.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// --- levels -----------------------------------------------------------------

assert(memoryLevelFor("principle") === 3, "a principle is level 3");
assert(memoryLevelFor("preference") === 2, "a preference is level 2");
assert(memoryLevelFor("decision") === 1, "a decision is level 1");
assert(memoryLevelFor("project_context") === 1, "project context is level 1");
assert(memoryLevelFor("experience") === 0, "raw experience is level 0");
assert(memoryLevelFor("something_new") === 0, "an unknown type is level 0");

// --- decay ------------------------------------------------------------------

assert(decayHalfLifeDays("experience") === 30, "an experience half-lives in a month");
assert(decayHalfLifeDays("principle") === 3650, "a principle holds for years");
assert(decayWeight("preference", 0) === 1, "a fresh memory keeps full weight");
assert(
  Math.abs(decayWeight("preference", 180) - 0.5) < 1e-9,
  "the half-life halves the weight"
);
assert(
  decayWeight("experience", 60) < decayWeight("experience", 10),
  "weight falls with age"
);
assert(
  decayWeight("principle", 180) > decayWeight("preference", 180),
  "a principle decays slower than a preference"
);

// --- the value score --------------------------------------------------------

assert(memoryValueScore() === 0.5, "no signal starts at 0.5");
assert(memoryValueScore({ explicitness: 1, frequency: 1, impact: 1, scope: 1, futureRelevance: 1 }) === 1, "all ones is one");
assert(memoryValueScore({ explicitness: 0, frequency: 0, impact: 0, scope: 0, futureRelevance: 0 }) === 0, "all zeros is zero");
assert(
  memoryValueScore({ explicitness: 5 }) <= 1 && memoryValueScore({ explicitness: -5 }) >= 0,
  "signals are clamped"
);

// --- retrieval --------------------------------------------------------------

const now = new Date("2026-09-19T04:00:00.000Z");
const freshPrinciple = memoryRetrievalScore(
  { type: "principle", updated_at: now.toISOString(), importance: 0.9, source: "user_explicit" },
  { now, keywordScore: 2 }
);
const oldExperience = memoryRetrievalScore(
  {
    type: "experience",
    updated_at: "2024-09-19T04:00:00.000Z",
    importance: 0.3,
    source: "ai_inferred",
  },
  { now, keywordScore: 2 }
);
assert(
  freshPrinciple > oldExperience,
  `a fresh principle outranks an old experience, got ${freshPrinciple} vs ${oldExperience}`
);
const freshExperience = memoryRetrievalScore(
  { type: "experience", updated_at: now.toISOString(), importance: 0.3 },
  { now, keywordScore: 2 }
);
assert(
  freshExperience > oldExperience,
  "a fresh experience outranks an old one with the same content"
);

// --- retrieval ranks by level and decay -------------------------------------

const db = await createTestDb();
await db
  .prepare(
    `INSERT INTO users (id, name, timezone, language, created_at, updated_at)
     VALUES ('u1', 'Tester', 'Asia/Shanghai', 'en', ?, ?)`
  )
  .run(now.toISOString(), now.toISOString());

async function addMemory(id: string, type: string, content: string, updatedAt: string, importance: number) {
  await db
    .prepare(
      `INSERT INTO memories
       (id, user_id, type, content, status, source, confidence, importance,
        created_at, updated_at)
       VALUES (?, 'u1', ?, ?, 'active', 'user_explicit', 0.9, ?, ?, ?)`
    )
    .run(id, type, content, importance, updatedAt, updatedAt);
}

await addMemory("old-exp", "experience", "prefers simplicity in tools", "2024-09-19T04:00:00.000Z", 0.3);
await addMemory("fresh-principle", "principle", "prefers simplicity above all", now.toISOString(), 0.9);
await addMemory("lone-exp", "experience", "deployed the release on a Tuesday", now.toISOString(), 0.9);

const retrieved = await retrieveActiveMemoriesForContext(db, "u1", "simplicity", 5);
assert(retrieved.length === 2, "both memories match the token");
assert(
  retrieved[0].id === "fresh-principle",
  `the fresh principle ranks first, got ${retrieved[0].id}`
);

// When nothing matches, principles and preferences fill the context — an
// unrelated experience is not injected.
const noMatch = await retrieveActiveMemoriesForContext(db, "u1", "zzzz", 5);
assert(
  noMatch.every((memory) => memory.type !== "experience"),
  "a non-matching query does not inject an experience"
);
assert(
  noMatch.some((memory) => memory.type === "principle"),
  "a non-matching query falls back to principles"
);

finish("memory value tests passed.");
