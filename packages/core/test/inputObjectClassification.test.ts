import { processRawInput } from "../src/agent/understand.js";
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

finish("input object classification tests passed.");
