# Aldus Palace

[![CI](https://github.com/heymi/aldus-palace/actions/workflows/ci.yml/badge.svg)](https://github.com/heymi/aldus-palace/actions/workflows/ci.yml)
[![npm core](https://img.shields.io/npm/v/%40aldus-palace%2Fcore?label=core)](https://www.npmjs.com/package/@aldus-palace/core)
[![npm mcp](https://img.shields.io/npm/v/%40aldus-palace%2Fmcp?label=mcp)](https://www.npmjs.com/package/@aldus-palace/mcp)
[![npm client](https://img.shields.io/npm/v/%40aldus-palace%2Fclient?label=client)](https://www.npmjs.com/package/@aldus-palace/client)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

![一次捕获会话](docs/assets/capture-session.svg)

**让 AI 记得住、排得清、也敢动手的可信上下文层。** 自由文本进来，带类型的承诺、决策与记忆出去——每一条都带着它的证据，存在你拥有的 SQLite 文件里。

> 英文版见 [`README.md`](README.md)；逐条验证指南见 [`EVALUATION.zh.md`](EVALUATION.zh.md)。

---

待办清单要求你把每一项归档、打标签、标日期、排优先级。列表越来越长，管理本身变成了工作。

AI 助手会记住关于你的事。那些记忆锁在一个黑盒里：只能在那一个应用里看，也带不走。

Aldus Palace 把你需要做的事收在一处。你写下一句话，系统负责归档。

```
$ pnpm demo

$ input  Ship the onboarding page next week
Captured · 1 commitment
  commitment  Ship the onboarding page next week  ·  window 2026-09-19 → 2026-09-26

$ input  I prefer simple tools
Captured · remembered 1
  memory      Prefers simple products and interfaces; avoids complexity  ·  active
```

这段输出来自确定性 provider，完全离线；日期按你运行当天解析。`pnpm demo` 用同一条流水线，不需要任何 API key。

**在你的助手里试用。** Claude、Cursor 或任何 MCP 客户端：

```bash
npm install -g @aldus-palace/mcp
claude mcp add aldus-palace -- node "$(npm root -g)/@aldus-palace/mcp/dist/index.js"
```

## 它做什么

**读一句话，分清它是什么。** 写「Ship the onboarding page next week」，你得到一条承诺，日期已经算好。没有项目选择器、没有优先级字段、没有截止日历。粘一段文字，你会得到多个对象：想法、承诺、决策、记忆候选。

**它抓重复。** 重复说一次，系统会指向第一条记录。

**它记住你亲口说的规则。** 「I prefer simple tools」会成为一条规则，从下一次捕获起生效；记忆列表可以随时归档它。

**它展示依据。** 每条记忆都带着你说过的那句话、背后的置信度，以及一条说明：这是你陈述的，还是系统推断的。

**它跟着你走。** 一个文件，一个 API。Claude、Cursor、你自己的前端、你写的脚本。

## 适合谁，何时用

**适合谁**

| 你是 | 你实际得到什么 | 从这里开始 |
|---|---|---|
| 构建 AI 产品的开发者 | 用户写一句话，系统就把它归成"要做的事 / 决定 / 值得记住的偏好"，存下来，需要时排进日程。这套规则不用你自己设计。 | [INTEGRATION.md](docs/INTEGRATION.md) |
| 想让上下文属于个人的用户 | 你的记忆和待办放在一个自己拥有的文件里。Claude、Cursor、终端读的都是同一份；每条记忆能看到出处，也能随时删掉。 | [能力 5、6、9](docs/CAPABILITIES.md) |
| 需要审计 AI 写入数据的团队 | 系统替你做过的每一步都有记录、能查、能撤销；发给模型前先去掉姓名、金额这类信息；点删除就是真的删掉。 | [SECURITY.md](SECURITY.md) · [ADR 0005](docs/adr/0005-action-gate-with-published-risk.md) |

**开发者能开箱拿到什么**

| 能力 | 你能实现的效果 |
|---|---|
| **文本 → 带类型的对象** | 用户写一句话，产品里就已经有了要做的事、决定和偏好——日期解析、去重、模型失败兜底都做好了。不用做表单，也不用自己写分类规则。 |
| **记忆层** | 助手能长期记住一个人，而且每条记忆都能解释来源、能纠正、能撤销；不会因为一句随口的话就"误解用户的人格"。 |
| **规划引擎** | 产品给的是"现在做这一件"，不是一屏红点；任务能排先后依赖、一天留出余量、拖着没动的事自己顺延。 |
| **本地优先 + 后台增强** | 用户输入后立刻有反馈，模型再慢慢补；重试、并发、崩溃都不会丢数据或写重复。 |
| **Action Gate + 隐私** | 敢让 agent 替你动手：高风险先问、越用越放权、每一步可撤销；发给云端前先脱敏，用户能收回权限、能一键真删除。 |
| **可替换 + 离线可验证 + 四种接入** | 今天用 SQLite + 离线模型就能跑，以后换 Postgres 或换模型不改业务代码；CI 无 key 全绿；库 / HTTP / MCP / 类型化 client 随便接。 |

**什么时候用**

| 你的处境 | 系统会做什么 |
|---|---|
| 「记忆不跟着我在不同客户端之间走。」 | 一份文件挂在 MCP 后面，Claude、Cursor、终端读的是同一份。 |
| 「助手自己编造了关于我的偏好，我删不掉。」 | 门控等你确认才生效，每条记忆都带出处，任何一条都能归档。 |
| 「早上看到一堆红点就烦。」 | 只给一个评分得出的"现在做这件"，错过的时间算风险不算失败，一天还留四分之一空档。 |
| 「要证明 AI 写进系统的内容是怎么来的。」 | 每次改动都写 action log 并附原因；记忆保留证据与版本。 |
| 「高风险操作得有人把关。」 | Action Gate 给每个 agent 动作分级：高风险等一次批准、关键级两次，日志可撤销。 |
| 「敏感数据不能原文发给模型。」 | Privacy Gateway 按数据级别脱敏；Level 4 不出本机，权限按 scope 授予，Memory 默认私有。 |

## 它听得懂的句子

下面是离线 provider 的真实运行结果。相对日期在捕获时解析。

| 你写 | 它归档为 |
|---|---|
| Ship the onboarding page next week | commitment · window 2026-09-19 → 2026-09-26 |
| I prefer simple tools | memory · active，因为你亲口说了 |
| Keep Mac only, no Windows version | thought + decision + 等待确认的 memory |
| Fix the notification bug tomorrow, twice | commitment · 重复项指向第一条记录 |
| 下周把 onboarding 做完 | 要做 · 时间窗 2026-09-19 → 2026-09-26 |
| 以后产品不要做太复杂，保持克制 | 记忆 · 已生效，因为你亲口说了 |
| 今晚先不做评审，改排到周五 | 要做 · 截止 2026-09-25 |

## 与现有方式对比

| 维度 | 你现在用的 | Aldus Palace |
|---|---|---|
| **你输入什么** | 表单：项目、截止日、优先级、标签 | 一句自己的话；一段文字产出多条记录 |
| **谁决定形态** | 你来分类、排优先级、排期 | 运行时归档想法、承诺、决策与记忆 |
| **时间怎么建模** | 一个截止日，过期标红 | 四类时间分开——截止、可用窗口、建议时段、未排期——错过的日期变成可移动的风险 |
| **记忆如何表现** | 助手在应用内部推断并存储 | 高置信记忆在捕获时生效，每条带着出处句子和生效说明 |
| **你的原话在哪** | 被摘要成任务或聊天记录 | 按你写的原样保留，系统自己的理解放在旁边 |
| **每日视图回答什么** | 列出全部 | 现在做什么、什么有风险、什么未排期；排满的一天会建议休息 |
| **有几份数据** | 每个应用一份 | 一份记录，MCP、HTTP、库与类型化客户端都能访问：Claude、Cursor、你的前端、脚本 |
| **记录存在哪** | 厂商云 | 你拥有的 SQLite 文件，或一个 Cloudflare Worker；可复制、可备份、可转交 |
| **怎么验证** | 用着看 | 确定性 provider 无网络、无 key 跑完整管线；28 个套件与 11 个 fixture 每次重放 |

## 怎么运行

- **一个人，一个实例。** 一个数据库、一个 bearer token；每人跑一个实例。
- **一个你拥有的 SQLite 文件**，或一个 Cloudflare Durable Object。可复制、可备份、可转交。
- **同一份数据，四个入口：** MCP、HTTP、库与类型化客户端。界面由你来做。
- **由你决定它做什么。** 运行时只记录意图与计划；是否对现实世界采取行动，由你决定。
- **离线模式** 用确定性 provider 跑完整条管线；通用理解请接模型，回执会标明是哪个 provider 产出的。

## 用它构建

四个入口，一套 schema，Apache-2.0 开源。离线模式无需 API key。

**库（Library）**

```ts
import { DevLLMProvider, ensureDevUser, formatActionCard, initialize, newId,
         nowIso, processRawInput } from "@aldus-palace/core";
import { openSqliteDatabase } from "@aldus-palace/core/db/sqlite";

const db = await openSqliteDatabase("./aldus.db");
await initialize(db);                              // canonical DDL + migrations
const user = await ensureDevUser(db, { name: "Me", timezone: "UTC", language: "en" });

const id = newId("inp");
const text = "Ship the onboarding page next week";
await db.prepare(`INSERT INTO raw_inputs
  (id, user_id, content, source, processing_status, created_at, updated_at)
  VALUES (?, ?, ?, 'text', 'pending', ?, ?)`)
  .run(id, user.id, text, nowIso(), nowIso());

const card = await processRawInput(db, new DevLLMProvider(), user, id, "local");
console.log(formatActionCard(card));
// Captured · 1 commitment
//   commitment  Ship the onboarding page next week  ·  window 2026-09-19 → 2026-09-26
```

**MCP** —— 在 Claude、Cursor 或任何 MCP 客户端里

```bash
npm install -g @aldus-palace/mcp
claude mcp add aldus-palace -- node "$(npm root -g)/@aldus-palace/mcp/dist/index.js"
```

**HTTP** —— 自托管，SQLite 放在卷里

```bash
cp .env.example .env && docker compose up --build
curl -X POST localhost:8787/v1/inputs \
  -H 'Authorization: Bearer dev-local-token' -H 'Content-Type: application/json' \
  -d '{"content":"Ship the onboarding page next week","mode":"sync"}'
```

**Client** —— 同一套 HTTP API 的类型化客户端

```ts
import { createClient } from "@aldus-palace/client";

const aldus = createClient({ baseUrl: "http://localhost:8787", token: "dev-local-token" });
const card = await aldus.capture("Ship the onboarding page next week", "local");
console.log(card.action_card.summary);        // Captured · 1 commitment
console.log(await aldus.actions("proposed")); // Action Gate 正在等什么
```

---

## 规模

`packages/core` 与运行时无关，依赖很轻：`zod`、`dayjs`、`nanoid`。**环境要求：** Node 20 或更新。`better-sqlite3` 为常见平台提供预编译包，其他平台需要 C 工具链。

## 背后的系统

运行时是一条流水线，Core Intelligence Layer 把它组织成四个引擎。Understanding——捕获前端，位于 `agent/understand.ts`——把一句话变成带类型的对象；引擎决定记住什么、接下来做什么、系统可以自主做什么、用哪个模型。模型可以参与理解和冲突检测，而每个引擎都有一条不依赖模型也能跑通的路径。每个引擎今天都已交付，并且都有一个设计中的延展——已交付部分标注了所在文件，完整设计见 [`docs/INTELLIGENCE.md`](docs/INTELLIGENCE.md)。

```
user / environment
      |
input          raw text, stored as written
      |
understanding  intent, typed objects, resolved dates, gates
      |
memory         candidates, evidence, confirmation, conflicts, versions
      |
planning       four kinds of time, today, risk, adaptive limits
      |
context        active memories and projects feed the next capture
```

| 引擎 | 今天已交付 | 设计中 |
|---|---|---|
| **Memory** | 抽取、污染门、激活门、每行证据、去重、冲突检测、版本化 supersede、分级 + 衰减 + 价值评分、全文检索回注下一次捕获 | 更多类型与信号、身份级、记忆图谱 |
| **Planning** | 四类时间、约束处理（截止、窗口、偏好、blocked-by 依赖）、优先级评分、时段搜索、按项目历史估算时长、每日缓冲、未开始灵活工作的自动顺延、带上下文匹配的评分 Now、早晨的 core/optional/deferred 计划、变更后自动重排、Today、风险、自适应上限、行为模型 | 软约束权衡、混合优先级、感知节奏的 Now、会议事件接入 |
| **Trust & autonomy** | Action Gate（低/中直接执行，高风险等批准，关键级要两次）并支持幂等的持久化执行、信任分与自主等级 0–4，以及受用户上限约束的权限演进 | 主动规则 |
| **Model orchestration** | 一个 `LLMProvider` 接口与三种实现，配置由调用方解析 | 按任务路由——快速分类、推理、embedding、敏感输入的本地模型 |

运行时代码都在 `packages/core/src`：`agent/understand.ts` 负责捕获，`services/` 是规划、记忆、Action Gate 与隐私，`lib/` 是纯函数，`providers/` 是模型接口。能力到代码的映射见 [`docs/MAP.md`](docs/MAP.md)，完整设计（每个引擎的已交付与计划部分）见 [`docs/INTELLIGENCE.md`](docs/INTELLIGENCE.md)。

### 记忆管线

```
capture -> extraction -> candidate -> evaluation -> conflict check -> storage -> activation -> retrieval
```

- **抽取** 读取两类信号：长期词（"from now on"、"as a rule"）与重复行为。规则不需要模型；模型补充通用理解。
- **评估** 丢弃不该记住的内容：临时状态、一次性创意片段、低置信猜测。
- **激活** 遵循唯一公开规则：`confidence >= 0.8` 且 `importance >= 0.8`；低于此值的作为候选等待。
- **冲突检测** 在同一维度上比较候选与已生效记忆，报告矛盾，而不是同时保留两种信念。
- **检索** 把已生效记忆注入下一次捕获，理解随之改善；每次注入都写入 action log。

### 让记忆诚实的三条规则

1. **情绪不会变成档案条目。** 「I'm tired today」在入库前就被丢弃。
2. **一次推断不构成原则。** 系统推断出的原则无论分数多高，都等待确认。
3. **每条记忆都带证据。** 出处句子、置信度，以及一条说明：这是你陈述的，还是系统推断的。

### 隐私是架构

*系统长期接触工作、决策、关系与习惯；隐私是它的形状，不是附加功能。*

**今天已交付** —— 你拥有的 SQLite 文件（或单个 Cloudflare Durable Object）、单用户运行时、不可变的 `raw_inputs`、经校验与门控的模型输出、每次变更写 `action_log`，以及一道记忆门：你陈述的高置信记忆在捕获时生效，推断则等待你确认。Privacy Gateway 会按数据级别准备云端调用（名称、金额、邮箱与电话会被替换，Level 4 不出本机）；权限渐进且细粒度，Memory 默认私有；`purgeUserData` 在一个事务里删除用户拥有的全部数据。[`SECURITY.md`](SECURITY.md) 记录了当前姿态与威胁模型。

云端 provider 只能与该 guard 一起创建，因此调用不会未脱敏就离开本机。

**设计中** —— 本地加密存储（Keychain / Secure Enclave）。

## 难点在哪

**模型返回文本，代码需要记录。** 模型会把 `"0.8"` 写成字符串、编造日期、把同一件事存成两个标题。运行时校验每个答案、跳过重复、在服务端解析日期；失败的答案不会覆盖已有记录。

**慢路径会毁掉产品。** 用户等模型就会失去兴趣。后台模型会遇到重试、两个客户端同时写入，以及崩溃后卡在中间状态的记录。

**记忆是负债。** 存下第一次推断，用户就被一句话定义了人格；直接替换旧记录，历史又消失了。

## 代码保证了什么

| 能力 | 要点 | 位置 |
|---|---|---|
| Schema & domain | `overdue` 没有可占据的状态；截止、窗口、时段是三个字段 | `db/schema.ts` |
| Providers | 确定性 provider 与付费实现共享同一接口，agent 逻辑可在 CI 中运行 | `providers/dev.ts` |
| Understanding | 模型提议，服务端决定（对象模式、去重、日期、回退） | `agent/understand.ts` |
| Progressive capture | lease 与 generation id 让「先本地、后模型」幂等 | `services/enrichmentLease.ts` |
| Memory | 高置信记忆生效、自我解释、以版本化代替删除 | `lib/memoryActivation.ts`、`services/memoryEvolution.ts` |
| Today & planning | 空的一天得到建议；排满的一天得到休息建议；四分之一个白天留空，未开始的灵活工作自动顺延，被依赖阻塞的任务不排期，Now 是评分而非排在最前 | `services/today.ts`、`services/workMigration.ts`、`services/dependencies.ts`、`lib/nowScore.ts` |
| Work streams | 分组是可重建的投影；记录本身不变 | `services/workStreams.ts` |
| HTTP API | 一套 schema，两种运行时：本地 SQLite 与 Cloudflare Durable Object | `apps/server` |
| MCP server | 无需服务进程，直接读同一个本地文件 | `packages/mcp` |
| Action Gate | 未分类的 agent 动作会等待；关键级需两次批准；每次决定都有日志且可撤销，信任分就是这些决定的通过率 | `services/actionGate.ts` |
| Privacy | 云端调用按数据级别脱敏且 Level 4 不出本机；未经授权 Memory 保持私有；删除会清空该用户的全部表 | `services/privacyGateway.ts`、`services/permissions.ts`、`services/dataLifecycle.ts` |

流水线可离线运行：确定性 provider 与模型实现共享同一接口，因此 28 个测试套件与 11 个验收 fixture 无需任何 key 即可重放。

## 看它跑起来

```bash
git clone https://github.com/heymi/aldus-palace.git && cd aldus-palace
pnpm install

pnpm verify   # 28 个套件 + 11 个 fixture + 构建 + 校验，全部离线
pnpm demo     # 上面的捕获演示

pnpm --filter @aldus-palace/example-understanding-only start
pnpm --filter @aldus-palace/example-memory-gate-only start
pnpm --filter @aldus-palace/example-today-only start
```

每个示例都会打印它存储的记录以及背后的推理，无需 API key，无需网络。

## 安装

| 入口 | 命令 |
|---|---|
| MCP | `npm install -g @aldus-palace/mcp` |
| HTTP | `cp .env.example .env && docker compose up --build` |
| Library | `npm install @aldus-palace/core` |
| Client | `npm install @aldus-palace/client` |

## 文档

| 文档 | 内容 |
|---|---|
| [INTEGRATION.md](docs/INTEGRATION.md) | 三个接入层级与可复制配置 |
| [CAPABILITIES.md](docs/CAPABILITIES.md) | 九项能力及其契约 |
| [USE-CASES.md](docs/USE-CASES.md) | 五个用它构建的场景 |
| [POSITIONING.md](docs/POSITIONING.md) | 差异化与当前边界 |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 运行时、模块边界、存储端口 |
| [INTELLIGENCE.md](docs/INTELLIGENCE.md) | 四引擎与隐私设计，已交付 vs 计划 |
| [BENCHMARKS.md](docs/BENCHMARKS.md) | 规则层实测数字与复现命令 |
| [BENCHMARKS-LLM.md](docs/BENCHMARKS-LLM.md) | 同一管线接真实模型的实测数字（需 key） |
| [MAP.md](docs/MAP.md) | 能力 → 代码 → 文档 → 测试 |
| [GLOSSARY.md](docs/GLOSSARY.md) | 术语表 |
| [EVALUATION.zh.md](EVALUATION.zh.md) | 逐条主张的验证指南 |
| [DOMAIN-SCHEMA.md](docs/DOMAIN-SCHEMA.md) | 对象、不变量、记忆演进 |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | 本地、边缘、嵌入式、备份 |
| [EVAL.md](docs/EVAL.md) | 验收 fixture 及如何新增 |
| [PROGRESSIVE-CAPTURE.md](docs/PROGRESSIVE-CAPTURE.md) | enrichment lease，写给直接照抄的人 |
| [packages/client/README.md](packages/client/README.md) | 类型化 HTTP 客户端 |
| [adr/](docs/adr) | 已作出的决策与理由 |

## 仓库结构

```
packages/core          领域模型、agent 运行时、存储端口、迁移、providers
packages/mcp           MCP 服务器（stdio）——profiles、本地与 HTTP 后端
packages/client        类型化 HTTP 客户端，每个路由一个方法
apps/server            Hono 参考服务器（本地 SQLite 与 Cloudflare Durable Object）
examples/              五个可运行示例，覆盖各能力组
spec/schema.sql        生成的可读 schema（CI 校验）
eval/fixtures          验收场景
docs/                  以上全部文档
```

## 状态

`0.x`——可用且经过测试；API 在小版本之间仍可能变化。对外暴露实例前请先读 [SECURITY.md](SECURITY.md)。

## 参与贡献

欢迎 fixture、文档与聚焦的修复，见 [CONTRIBUTING.md](CONTRIBUTING.md)。提交需带 DCO 签名（`git commit -s`）。

## 许可证

[Apache-2.0](LICENSE)。
