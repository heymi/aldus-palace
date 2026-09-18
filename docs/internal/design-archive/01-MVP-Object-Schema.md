# 01. MVP Object Schema（V1 字段子集冻结）

Version: 1.0  
Status: **Frozen for V1**  
Parent: `docs/00-MVP-Decisions.md`  
Last Updated: 2026-07-18

---

## 0. 文档地位

本文件冻结 **V1 领域对象的字段级契约**。

优先级：

```text
00-MVP-Decisions.md     （范围与规则）
        ↓
01-MVP-Object-Schema.md （本文件：对象与字段）
        ↓
Object_Model___Database_Schema.md  （愿景全量，仅作扩展参考）
```

**当全量 Object Model 与本文件冲突时，以本文件为准。**

非目标：

- 不是完整 SQL DDL（可直接映射到 PostgreSQL，但不在此写 migration）
- 不定义 REST 路径与 DTO 命名细节
- 不包含 Phase 2+ 对象（RecurrenceRule、Relationship、Goal 层级、UserProfile 全量等）

约定：

| 标记 | 含义 |
|------|------|
| **R** | Required（创建后必须有） |
| **O** | Optional（可空） |
| **S** | System（系统生成，客户端不写） |
| **AI** | 通常由 Agent 填充，用户可改 |
| **U** | 通常由用户动作产生 |

类型约定（逻辑类型，非某语言）：

- `id`：稳定字符串 UUID
- `datetime`：ISO-8601，带时区
- `date`：日历日
- `float0_1`：0.0–1.0
- `text`：非空字符串（除非标明可空）
- `json`：结构化附加数据（V1 尽量少用）

所有业务对象（除特别说明）默认包含：

```text
id            S  id
user_id       R  id          所属用户
created_at    S  datetime
updated_at    S  datetime
```

---

## 1. V1 对象清单

### In scope

```text
User
RawInput
Project
Thought
Commitment
Memory
Decision
Event
ActionLog
```

### Out of scope as first-class tables（V1）

```text
Goal（层级目标）
UserProfile / WorkingPattern / Principle 独立表
Relationship
RecurrenceRule
ContextSnapshot
Knowledge / Document
Task / Note / Reminder（投影，不建模）
```

说明：

- **Principle** 以 `Memory.type = principle` 存在，不单独建表。
- **Preference** 同理 → `Memory.type = preference`。
- **Project Context** → `Memory.type = project_context`。
- **Short-term Context** 不进 Memory 表；可用客户端/服务端会话态或轻量 cache，不在此 schema 强制。

---

## 2. User

账户身份。非 AI 对用户的理解模型。

| Field | Req | Type | Notes |
|-------|-----|------|--------|
| id | S | id | |
| name | O | text | 显示名 |
| timezone | R | text | IANA，如 `Asia/Tokyo`；影响 Planning |
| language | R | text | 如 `zh-CN` / `en` |
| calendar_write_enabled | R | bool | **默认 false**（见 00 §8） |
| created_at | S | datetime | |
| updated_at | S | datetime | |

### Deferred

- role / industry / focus_area（UserProfile）
- trust_score / autonomy_level 持久化（V1 可用配置默认值，不必用户级动态分）

---

## 3. RawInput

统一输入的原始记录。先存再理解。

| Field | Req | Type | Notes |
|-------|-----|------|--------|
| id | S | id | |
| user_id | R | id | |
| content | R | text | 文本；语音则为转写结果 |
| source | R | enum | 见下 |
| language | O | text | 检测结果 |
| raw_audio_ref | O | text | 可选存储引用；V1 可空实现 |
| client_context | O | json | 如当时活跃 project_id、app 状态；勿塞全量历史 |
| processed_at | O | datetime | 处理完成时间；空=尚未处理或失败 |
| processing_status | R | enum | `pending` / `processed` / `failed` |
| error_message | O | text | failed 时 |
| created_at | S | datetime | |
| updated_at | S | datetime | |

### source

```text
text
voice
shortcut
menu_bar
widget
system_event
```

V1 至少实现：`text`；`voice` / `shortcut` / `menu_bar` 按客户端能力启用。

### Rules

- 创建时 **不做** 对象抽取；只持久化原始内容。
- 一次 RawInput 可产生多个下游对象（Thought + Commitment + Memory Candidate…）。

---

## 4. Project

上下文容器，不是项目管理工具。

| Field | Req | Type | Notes |
|-------|-----|------|--------|
| id | S | id | |
| user_id | R | id | |
| name | R | text | 如 `Nimbus` |
| description | O | text | 一句话定位 |
| brief | O | text | 项目长背景，供 AI 理解受众、品类、阶段与边界；不是长期 Memory 的替代品 |
| aliases | O | json/text | 项目别名列表；实现可存 JSON array 或逗号分隔文本，用于输入匹配 |
| status | R | enum | `active` / `paused` / `archived` |
| created_at | S | datetime | |
| updated_at | S | datetime | |

### Rules

- 无 Kanban 字段、无 progress%、无 sprint。
- `brief` 只保存稳定的项目基础语境，避免每次理解都缺少品类/受众/阶段信息；它不替代可确认、可追溯的 **Memory (project_context / principle)**。
- `aliases` 仅用于名称匹配，不承载标签体系或项目管理分类。
- 项目「原则 / 定位」仍应走 **Memory (project_context / principle)**，不塞进无结构的 Project 大 JSON。

### Deferred

- goals[]、documents、people

---

## 5. Thought

思想对象。不是 Note。

| Field | Req | Type | Notes |
|-------|-----|------|--------|
| id | S | id | |
| user_id | R | id | |
| type | R | enum | V1 仅 5 种，见下 |
| content | R | text | 规范化后的思想陈述 |
| original_excerpt | O | text | 用户原话片段，便于解释 |
| project_id | O | id | 可空；AI 可建议关联 |
| status | R | enum | V1 生命周期，见下 |
| importance | O | float0_1 | AI；默认可 0.5 |
| source_input_id | O | id | → RawInput |
| created_at | S | datetime | |
| updated_at | S | datetime | |

### type（V1 only）

```text
idea
insight
observation
research
decision_candidate
```

禁止写入：`principle` / `note` / `question`（见 00 §3）。

### status（V1）

最小集即可：

```text
captured      刚捕获
exploring     仍在思考
converted     已转化为 Decision / Commitment 等
archived      归档
```

### Deferred

- 完整 maturity：`refined` / `validated`
- 多项目多对多关联
- embedding 向量列（可用并行 vector 索引表，见 §12）

---

## 6. Commitment

工作承诺。替代 Task 作为一等公民。

| Field | Req | Type | Notes |
|-------|-----|------|--------|
| id | S | id | |
| user_id | R | id | |
| title | R | text | 可执行的短标题 |
| goal | O | text | 为何要做；非 Goal 实体 |
| optimized_content | O | text | AI 整理后的任务正文；保留结果、约束与验收信息，可由用户编辑 |
| project_id | O | id | |
| status | R | enum | 见下 |
| deadline | O | datetime | **真实承诺截止**；无则空 |
| window_start | O | datetime | Flexible Window 起 |
| window_end | O | datetime | Flexible Window 止 |
| duration_minutes | O | int | 预估耗时；AI 可估 |
| importance | O | float0_1 | AI 计算；用户可不设 |
| ai_slot_start | O | datetime | 当前 AI 建议开始 |
| ai_slot_end | O | datetime | 当前 AI 建议结束 |
| scheduled_event_id | O | id | → Event；日历写入成功后可挂 |
| source_thought_id | O | id | 若由 Thought 转化 |
| source_input_id | O | id | → RawInput |
| started_at | O | datetime | 用户点开始 |
| completed_at | O | datetime | 用户点完成 |
| created_at | S | datetime | |
| updated_at | S | datetime | |

### status（V1，与 00 一致）

```text
captured     已捕获，未进入计划
planned      已纳入规划意图，尚无具体 AI Slot
scheduled    已有 AI Slot（或固定时间已对齐）
completed
cancelled
risk         真实承诺处于风险（非错过 AI Slot）
```

**不包含** `executing` 作为必须状态：执行中可用 `started_at != null && status = scheduled` 表达；若实现更简单，允许本地 UI 态，不必新增枚举。

### Time semantics（字段映射）

| 时间概念 | 字段 |
|----------|------|
| Fixed Time | 通常来自 `Event`（日历会议），Commitment 可关联但不伪造 fixed |
| Deadline | `deadline` |
| Flexible Window | `window_start` + `window_end` |
| AI Slot | `ai_slot_start` + `ai_slot_end` |

### Rules

1. **错过 `ai_slot_*` 不得自动标 `risk` 或 delay。**
2. **进入 `risk` 的条件（V1 最小）**：存在 `deadline` 且当前时间已接近/超过 deadline 仍未 `completed` / `cancelled`；或用户/规则明确标记。细节算法可简单，语义不可反。
3. 无 Recurrence 字段。
4. `importance` 不由用户表单必填；避免 Todo 式优先级 UI。

### Deferred

- dependency[]、trigger、recurrence
- 多段拆分 sub-commitment
- 复杂 energy / context switching 成本字段

---

## 7. Decision

显式决策记录（可来自 Thought `decision_candidate` 升级，或输入直接抽取）。

| Field | Req | Type | Notes |
|-------|-----|------|--------|
| id | S | id | |
| user_id | R | id | |
| title | R | text | 决定了什么 |
| reason | O | text | 为什么 |
| project_id | O | id | |
| status | R | enum | `active` / `superseded` / `retracted` |
| source_thought_id | O | id | |
| source_input_id | O | id | |
| related_memory_id | O | id | 若已沉淀为 Memory(decision) |
| created_at | S | datetime | |
| updated_at | S | datetime | |

### Rules

- Decision 对象与 Memory(type=decision) **可同时存在**：
  - Decision = 结构化决策事件
  - Memory(decision) = 进入长期记忆库、需确认的「应记住的决策」
- V1 允许：创建 Decision 时 **提议** Memory Candidate，不自动 Active。

### Deferred

- confidence 分数、影响范围图谱

---

## 8. Memory

长期记忆。仅 4 种 type。永久记忆必须确认。

| Field | Req | Type | Notes |
|-------|-----|------|--------|
| id | S | id | |
| user_id | R | id | |
| type | R | enum | 见下 |
| content | R | text | 记忆陈述 |
| project_id | O | id | `project_context` 时 **建议 R**（应用层校验） |
| status | R | enum | 见下 |
| confidence | O | float0_1 | AI |
| importance | O | float0_1 | AI |
| source | R | enum | 见下 |
| evidence | O | text | 可解释依据（重复次数、原话摘要等） |
| source_input_id | O | id | |
| source_decision_id | O | id | |
| confirmed_at | O | datetime | 用户确认时间；active 时建议有值 |
| created_at | S | datetime | |
| updated_at | S | datetime | |

### type（V1 only）

```text
preference
project_context
principle
decision
```

禁止：`identity` / `relationship` / `observation` 作为持久 Memory type。  
内部 Observation 仅作流水线中间态，**不写入 Memory 表**（或仅短暂 candidate 前处理，不对外展示）。

### status

```text
candidate    待用户确认
active       已确认，可影响 Agent
archived     用户丢弃或过时归档
```

V1 不强制实现 `superseded` 状态机；更新可用新 candidate 替换或直接编辑 active。

### source

```text
user_explicit     用户明确说出
ai_inferred       AI 推断（仍须确认才 active）
decision_promote  从 Decision 提升
```

### Rules

1. `status = active` 前必须经过用户确认（00 §5）。
2. Short-term Context **不得** 写入本表。
3. Memory UI 只展示 candidate + active（+ 可选 archived）。

### Deferred

- decay、自动 supersede、证据图谱、embedding 存同表

---

## 9. Event

时间轴上的事件：外部日历同步 +（可选）AI 写入的工作块。

| Field | Req | Type | Notes |
|-------|-----|------|--------|
| id | S | id | |
| user_id | R | id | |
| title | R | text | |
| kind | R | enum | 见下 |
| start_at | R | datetime | |
| end_at | R | datetime | |
| is_all_day | R | bool | 默认 false |
| source | R | enum | `apple_calendar` / `google_calendar` / `app` |
| external_id | O | text | 外部日历事件 ID；同步用 |
| commitment_id | O | id | AI 工作块关联的 Commitment |
| read_only | R | bool | 外部导入会议通常 true |
| created_at | S | datetime | |
| updated_at | S | datetime | |

### kind

```text
fixed_external    外部会议/硬约束
ai_work_block     AI 建议写入的工作块（仅 write 开启时）
```

### Rules

1. Planning **读取** `fixed_external` 作为不可移动约束。
2. 仅当 `User.calendar_write_enabled = true` 时可创建/更新 `ai_work_block` 并推送到外部日历。
3. Event 不是 Commitment 的替代品；Commitment 仍是工作真相源。

### Deferred

- 忙碌详情、参会人、会议室、双向复杂同步冲突 UI

---

## 10. ActionLog

Agent 与用户关键动作的可解释日志（Activity 页 + 信任）。

| Field | Req | Type | Notes |
|-------|-----|------|--------|
| id | S | id | |
| user_id | R | id | |
| actor | R | enum | `user` / `agent` |
| action_type | R | enum | 见下（可扩展字符串枚举） |
| summary | R | text | 人可读一句话 |
| reason | O | text | 为什么（Agent 动作必填更佳） |
| entity_type | O | text | `thought` / `commitment` / `memory` / … |
| entity_id | O | id | |
| payload | O | json | 变更前后摘要；避免过大 |
| reversible | R | bool | V1 真撤销可简化，但字段保留 |
| created_at | S | datetime | |

### action_type（V1 最小集）

```text
input_captured
objects_extracted
thought_created
commitment_created
commitment_status_changed
ai_slot_assigned
ai_slot_adjusted
plan_generated
memory_candidate_created
memory_confirmed
memory_rejected
user_started
user_completed
user_snoozed
user_edited
calendar_synced
```

### Rules

- 重要 Agent 动作应写 Log（00 / AGENTS：explainable、logged）。
- Activity UI 聚合本日 `actor = agent` 的 summary 即可。

---

## 11. 对象关系（V1）

```text
User
 ├── 1:N Project
 ├── 1:N RawInput
 ├── 1:N Thought
 ├── 1:N Commitment
 ├── 1:N Memory
 ├── 1:N Decision
 ├── 1:N Event
 └── 1:N ActionLog

RawInput  1:N  → Thought | Commitment | Decision | Memory (via source_input_id)

Project   1:N  → Thought | Commitment | Memory | Decision

Thought   0:1  → Commitment (source_thought_id)
Thought   0:1  → Decision   (source_thought_id)

Decision  0:1  → Memory     (related_memory_id / source_decision_id)

Commitment 0:1 → Event      (scheduled_event_id / commitment_id)
```

V1 **不做** 多对多关联表；需要时用单外键。

---

## 12. 派生视图（非表，查询约定）

### Today / Now

非独立实体。由查询得出：

**Now（一件）** 候选规则（实现可迭代，语义固定「只突出一件」）：

1. `status = scheduled` 且 `ai_slot` 覆盖当前时间，或 `started_at` 非空
2. 否则最近的 `scheduled` by `ai_slot_start`
3. 否则最高 `importance` 的 `planned` / `captured` 且 window 含今天
4. `risk` 可优先于普通项（产品可配置，但 Now 仍只显示 1 条）

**Timeline**：

- 今日 `Event.fixed_external`
- 今日有 `ai_slot_*` 的 Commitment
- 标注 Fixed / Flexible / Suggested

**Risks**：

- `Commitment.status = risk`
- 或 `deadline` 落在危险窗口且未完成

### Work 智能分组

逻辑上是 Commitment 的可重建展示投影，不是新的领域对象。实现可缓存为
`commitment_classifications`，但不得让用户维护 Category 表。

最小投影字段：

```text
commitment_id
project_id
group_key          # 稳定标识；label 可变
group_label
source             # ai | user | fallback
reason
classifier_version
commitment_fingerprint
context_fingerprint
generation_id
manual_override
updated_at
```

规则：

1. 每个开放 Commitment 同时只有一个当前展示组。
2. `project_id` 是硬锚点，分类不得修改。
3. 人工覆盖优先于任何后续 AI 重建。
4. 只允许同项目、`status=active` 的 Memory 参与消歧；每次重建总计最多 3 条，candidate/archived 禁止注入。
5. `GET /commitments` 只读；重建使用独立、幂等、有 generation/lease 的命令。
6. 分类失败保留旧投影；无旧投影时按 Project / 待归类返回完整列表。

### Memory UI 分组

按 `type` 分组：Preference / Project Context / Principle / Decision；  
列表过滤 `status in (candidate, active)`。

---

## 13. Vector / Embedding（并行存储）

不进入核心关系字段，但 V1 Memory 检索需要：

| Field | Type | Notes |
|-------|------|--------|
| owner_type | text | `memory` / 可选 `thought` |
| owner_id | id | |
| user_id | id | |
| embedding | vector | 模型维度固定 |
| content_hash | text | 变更时重嵌 |
| updated_at | datetime | |

仅 **active Memory**（及可选高价值 Thought）入索引；candidate 确认后再索引亦可。

---

## 14. 创建不变量（Agent 写入时必须遵守）

1. **先 RawInput，后对象**（系统事件除外）。
2. 一次理解结果可多对象；每个对象尽量带 `source_input_id`。
3. 不确定是 Commitment 还是 Thought → **偏 Thought**（00 / Behavior：不确定时保存，不强行行动）。
4. 永久 Memory 只建 `candidate`，禁止直接 `active`（除非未来显式用户设置；V1 无此捷径）。
5. 调整 `ai_slot_*` 不改变 `deadline` / window，除非用户改承诺本身。
6. `calendar_write_enabled = false` 时禁止创建外部 `ai_work_block`。
7. 禁止创建 `recurrence_*` 字段或循环实例。

---

## 15. 与愿景 Schema 的裁剪对照

| 愿景对象/字段 | V1 |
|---------------|-----|
| UserProfile / WorkingPattern | ❌ 延后 |
| Goal 层级 | ❌ 延后；Commitment.goal 文本即可 |
| Thought 7+ types | ❌ 仅 5 种 |
| Commitment.dependency / recurrence | ❌ |
| Memory Identity / Relationship | ❌ |
| Preference 独立表 | ❌ → Memory.preference |
| Principle 独立表 | ❌ → Memory.principle |
| RecurrenceRule | ❌ |
| Relationship | ❌ |
| ContextSnapshot | ❌ |
| Memory supersede 全状态机 | 简化为 candidate/active/archived |
| Graph DB | ❌ |

---

## 16. JSON 示例（规范形状）

### RawInput → 抽取结果（逻辑，非必须单表）

```json
{
  "raw_input_id": "inp_001",
  "thoughts": [
    {
      "type": "insight",
      "content": "Nimbus Classic 应弱化 AI-first 表达",
      "status": "captured",
      "project_id": "proj_orvia"
    }
  ],
  "commitments": [
    {
      "title": "调整官网定位表达",
      "status": "planned",
      "window_start": "2026-07-21T00:00:00+09:00",
      "window_end": "2026-07-27T23:59:59+09:00",
      "duration_minutes": 90,
      "project_id": "proj_orvia"
    }
  ],
  "memory_candidates": [
    {
      "type": "principle",
      "content": "AI should assist, not dominate",
      "status": "candidate",
      "source": "ai_inferred",
      "confidence": 0.72
    }
  ]
}
```

### Active Memory

```json
{
  "type": "preference",
  "content": "喜欢简洁、原生、自然英文表达",
  "status": "active",
  "source": "user_explicit",
  "evidence": "用户明确表示；并在多次设计讨论中拒绝复杂方案",
  "confidence": 0.9,
  "confirmed_at": "2026-07-18T10:00:00+09:00"
}
```

---

## 17. 实现映射建议（非强制）

| 逻辑对象 | PostgreSQL 表示例 |
|----------|-------------------|
| User | users |
| RawInput | raw_inputs |
| Project | projects |
| Thought | thoughts |
| Commitment | commitments |
| Decision | decisions |
| Memory | memories |
| Event | events |
| ActionLog | action_logs |
| Embedding | embeddings 或 pgvector 列附属表 |

索引建议（V1）：

- `(user_id, created_at)` 于 thoughts / commitments / memories / action_logs
- commitments：`(user_id, status)`、`(user_id, deadline)`、`(user_id, ai_slot_start)`
- memories：`(user_id, type, status)`
- events：`(user_id, start_at, end_at)`、`(user_id, external_id)` unique 可空

---

## 18. 变更规则

变更本 Schema 必须：

1. 同步检查 `00-MVP-Decisions.md` 是否仍成立  
2. 若扩大范围（新 type、新一等对象），先改 00，再改 01  
3. 禁止在实现中静默引入 Task/Note 主模型  

---

## Final Check

实现前自问：

- 是否在用 Task 当主对象？→ 停，用 Commitment  
- 是否自动 active 了 Memory？→ 停，必须 candidate  
- 是否因错过 AI Slot 标了 Risk？→ 停，语义错误  
- 是否建了 Recurring / Horizon / Identity Memory？→ 移出 V1  

Build the smallest schema that still is a Aldus Palace — not a todo database with an LLM wrapper.
