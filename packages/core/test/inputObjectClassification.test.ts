import { processRawInput } from "../src/agent/understand.js";
import { shouldAskObjectMode } from "../src/lib/objectAmbiguity.js";
import {
  classificationTerms,
  matchClassificationSignal,
  rememberClassification,
} from "../src/lib/classificationSignals.js";
import { applyObjectChoice } from "../src/services/reclassify.js";
import { resolveClarificationByOption } from "../src/services/resolveClarification.js";
import type { LLMProvider } from "../src/providers/types.js";
import type { SqlDatabase } from "../src/db/port.js";
import type { User } from "../src/domain/types.js";
import { createTestDb, finish } from "./support/db.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const now = "2026-07-22T04:00:00.000Z";
const user: User = {
  id: "u1",
  name: "Tester",
  timezone: "Asia/Shanghai",
  language: "zh-CN",
  calendar_write_enabled: false,
  created_at: now,
  updated_at: now,
};

type Extraction = {
  object_mode?: "thought" | "commitment" | "mixed";
  intent: { has_actionable_work: boolean; work_titles: string[] };
  thoughts: Array<{ type: string; title: string; content: string }>;
  commitments: Array<{ title: string; optimized_content: string }>;
  decisions: never[];
  memory_candidates: never[];
  warnings: never[];
};

class FixedProvider implements LLMProvider {
  readonly name = "fixed-classification-test";

  constructor(private readonly extraction: Extraction) {}

  async complete(): Promise<string> {
    return JSON.stringify(this.extraction);
  }
}

async function makeDb(): Promise<SqlDatabase> {
  const db = await createTestDb();
  await db
    .prepare(
      `INSERT INTO users
       (id, name, timezone, language, calendar_write_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      user.id,
      user.name,
      user.timezone,
      user.language,
      Number(user.calendar_write_enabled),
      now,
      now
    );
  return db;
}

async function process(
  id: string,
  content: string,
  extraction: Extraction
) {
  const db = await makeDb();
  await db
    .prepare(
      `INSERT INTO raw_inputs
       (id, user_id, content, source, processing_status, created_at, updated_at)
       VALUES (?, ?, ?, 'text', 'pending', ?, ?)`
    )
    .run(id, user.id, content, now, now);
  return processRawInput(db, new FixedProvider(extraction), user, id, "full");
}

const pureTask = await process("input-task", "周五前改完官网首页文案", {
  object_mode: "commitment",
  intent: {
    has_actionable_work: true,
    work_titles: ["改完官网首页文案"],
  },
  thoughts: [
    {
      type: "idea",
      title: "官网首页文案",
      content: "需要修改官网首页文案。",
    },
  ],
  commitments: [
    {
      title: "改完官网首页文案",
      optimized_content: "周五前完成官网首页文案修改。",
    },
  ],
  decisions: [],
  memory_candidates: [],
  warnings: [],
});
assert(pureTask.commitments.length === 1, "pure task must create one commitment");
assert(
  pureTask.thoughts.length === 0,
  `pure task must not create a duplicate thought, got ${pureTask.thoughts.length}`
);

const pureThought = await process(
  "input-thought",
  "我想到一个方向：首页可以像一本安静展开的杂志",
  {
    object_mode: "thought",
    intent: {
      has_actionable_work: false,
      work_titles: [],
    },
    thoughts: [
      {
        type: "idea",
        title: "安静展开的杂志式首页",
        content: "首页可以借用杂志缓慢展开的视觉隐喻。",
      },
    ],
    commitments: [
      {
        title: "设计杂志式首页",
        optimized_content: "设计一个像杂志一样展开的首页。",
      },
    ],
    decisions: [],
    memory_candidates: [],
    warnings: [],
  }
);
assert(pureThought.thoughts.length === 1, "pure idea must create one thought");
assert(
  pureThought.commitments.length === 0,
  `pure idea must not create a commitment, got ${pureThought.commitments.length}`
);

const mixed = await process(
  "input-mixed",
  "想做 iOS 版，下个月研究一下可行性",
  {
    object_mode: "mixed",
    intent: {
      has_actionable_work: true,
      work_titles: ["研究 iOS 版可行性"],
    },
    thoughts: [
      {
        type: "idea",
        title: "iOS 版方向",
        content: "产品可以扩展到 iOS。",
      },
    ],
    commitments: [
      {
        title: "研究 iOS 版可行性",
        optimized_content: "下个月研究 iOS 版的可行性。",
      },
    ],
    decisions: [],
    memory_candidates: [],
    warnings: [],
  }
);
assert(mixed.thoughts.length === 1, "mixed input must preserve its thought");
assert(mixed.commitments.length === 1, "mixed input must preserve its commitment");

const legacyTask = await process("input-legacy-task", "周五前改完官网首页文案", {
  intent: {
    has_actionable_work: true,
    work_titles: ["改完官网首页文案"],
  },
  thoughts: [
    {
      type: "idea",
      title: "官网首页文案",
      content: "需要修改官网首页文案。",
    },
  ],
  commitments: [
    {
      title: "改完官网首页文案",
      optimized_content: "周五前完成官网首页文案修改。",
    },
  ],
  decisions: [],
  memory_candidates: [],
  warnings: [],
});
assert(
  legacyTask.thoughts.length === 0 && legacyTask.commitments.length === 1,
  "responses without object_mode must still collapse duplicate task thoughts"
);

// --- the grey zone asks instead of guessing ---------------------------------

assert(
  shouldAskObjectMode("分类记忆不生效，没在设置里显示"),
  "a defect report with a weak work signal is a grey zone"
);
assert(
  !shouldAskObjectMode("最近觉得 AI 产品都太吵了，干扰太多"),
  "a mood is never a grey-zone question"
);
assert(
  !shouldAskObjectMode("记一下"),
  "too short to ask"
);

// End to end: the ambiguous input becomes a pending question, not a thought.
const greyDb = await makeDb();
async function captureInto(
  db: SqlDatabase,
  id: string,
  content: string
) {
  await db
    .prepare(
      `INSERT INTO raw_inputs
       (id, user_id, content, source, processing_status, created_at, updated_at)
       VALUES (?, ?, ?, 'text', 'pending', ?, ?)`
    )
    .run(id, user.id, content, now, now);
  return processRawInput(
    db,
    new FixedProvider({
      object_mode: "thought",
      intent: { has_actionable_work: false, work_titles: [] },
      thoughts: [{ type: "observation", title: "分类记忆不生效", content }],
      commitments: [],
      decisions: [],
      memory_candidates: [],
      warnings: [],
    }),
    user,
    id,
    "full"
  );
}

const ambiguous = await captureInto(greyDb, "input-grey", "分类记忆不生效，没在设置里显示");
assert(ambiguous.commitments.length === 0, "the ambiguous input is still a thought");
assert(ambiguous.clarifications.length === 1, "it asks one question instead of guessing");
assert(
  ambiguous.clarifications[0].kind === "object_mode",
  `the question is about the object mode, got ${ambiguous.clarifications[0].kind}`
);
assert(
  ambiguous.clarifications[0].options.map((o) => o.id).join(",") === "bug,task,note",
  "the options are defect, work, note"
);

const resolved = await resolveClarificationByOption(
  greyDb,
  user.id,
  ambiguous.clarifications[0].id,
  "bug",
  "zh-CN"
);
assert(resolved.commitment !== null, "answering defect creates the work");
assert(
  String(resolved.commitment?.title).startsWith("修复："),
  `the defect title is labelled, got ${String(resolved.commitment?.title)}`
);
const converted = (await greyDb
  .prepare(`SELECT status FROM thoughts WHERE id = ?`)
  .get(ambiguous.thoughts[0].id)) as { status: string };
assert(converted.status === "converted", "the carrying thought is converted");

// The correction is remembered: a similar sentence is classified without asking.
const similar = await captureInto(greyDb, "input-grey-2", "设置里显示不对，样式也乱了");
assert(
  similar.clarifications.length === 0,
  "the learned signal skips the question"
);
assert(
  similar.commitments.length === 1,
  `the similar input becomes work from the learned signal, got ${similar.commitments.length}`
);

// --- reclassify by hand -----------------------------------------------------

const noteInput = await captureInto(greyDb, "input-note", "今天有点乱，信息太多");
assert(noteInput.clarifications.length === 0, "a mood is stored without a question");
const promoted = await applyObjectChoice(greyDb, user.id, "input-note", "task", {
  locale: "zh-CN",
});
assert(
  promoted.commitment !== null && promoted.commitment.status === "captured",
  "a note can be promoted to work"
);
const demoted = await applyObjectChoice(greyDb, user.id, "input-note", "note", {
  locale: "zh-CN",
});
assert(demoted.cancelled_commitments === 1, "correcting back to a note cancels the work");

// Signals are term-based, and one shared word is not enough.
const terms = classificationTerms("设置里显示不对");
assert(terms.includes("设置里"), `CJK trigrams are terms, got ${terms.join(",")}`);
await rememberClassification(greyDb, user.id, "搜索框太小了", "bug");
assert(
  (await matchClassificationSignal(greyDb, user.id, "搜索框太小了")) === "bug",
  "the same words match their signal"
);
assert(
  (await matchClassificationSignal(greyDb, user.id, "记忆很重要")) === null,
  "a single shared word does not match"
);

finish("input object classification tests passed.");
