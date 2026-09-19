# Aldus Palace

[![CI](https://github.com/heymi/aldus-palace/actions/workflows/ci.yml/badge.svg)](https://github.com/heymi/aldus-palace/actions/workflows/ci.yml)
[![npm core](https://img.shields.io/npm/v/%40aldus-palace%2Fcore?label=core)](https://www.npmjs.com/package/@aldus-palace/core)
[![npm mcp](https://img.shields.io/npm/v/%40aldus-palace%2Fmcp?label=mcp)](https://www.npmjs.com/package/@aldus-palace/mcp)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

![一次捕获会话](docs/assets/capture-session.svg)

**面向 AI 应用的可审计记忆层。** 自由文本进来，带类型的承诺、决策与记忆出去——每一条都带着它的证据，存在你拥有的 SQLite 文件里。

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
| **有几份数据** | 每个应用一份 | 一份记录，MCP、HTTP 与库都能访问：Claude、Cursor、你的前端、脚本 |
| **记录存在哪** | 厂商云 | 你拥有的 SQLite 文件，或一个 Cloudflare Worker；可复制、可备份、可转交 |
| **怎么验证** | 用着看 | 确定性 provider 无网络、无 key 跑完整管线；19 个套件与 11 个 fixture 每次重放 |

## 当前边界

- **单用户。** 一个人、一个数据库、一个 bearer token。每人跑一个实例。
- **单个 SQLite 写入者。** 两个进程写同一个文件会争抢写锁；额外客户端请指向 HTTP API。
- **没有客户端界面。** 入口是 MCP、HTTP 和库，界面由你来做。
- **没有同步。** 文件不会与第二份副本合并。
- **没有对外动作。** 运行时只记录意图与计划：不发邮件、不发帖、不付款。
- **离线模式只认有限句式。** 确定性 provider 处理命令句、陈述规则和少量日期形式，支持中英文。通用理解请接模型；回执会标明是哪个 provider 产出的。

## 用它构建

三个入口，一套 schema，Apache-2.0 开源。离线模式无需 API key。

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
| **Memory** | 抽取、污染门、激活门、每行证据、去重、冲突检测、版本化 supersede、回注下一次捕获 | 分级记忆、按类型衰减、价值评分、更多类型与信号、记忆图谱 |
| **Planning** | 四类时间、具体约束处理（截止/窗口/学习到的项目偏好）、优先级评分、避开冲突的时段搜索、按项目历史估算时长、Today、风险、自适应上限、行为模型、轻量分诊 | 更完整的约束、混合优先级、含切换成本的调度优化、缓冲、迁移 |
| **Trust & autonomy** | 一条固定规则，外加 Action Gate：低/中风险直接执行，高风险等一次批准，关键级要两次 | 自主等级 0–4、信任分、权限演进 |
| **Model orchestration** | 一个 `LLMProvider` 接口与三种实现，配置由调用方解析 | 按任务路由——快速分类、推理、embedding、敏感输入的本地模型 |

代码位于 `lib/memoryExtract.ts`、`lib/memoryActivation.ts`、`services/memoryLifecycle.ts`、`services/memoryEvolution.ts`、`services/today.ts`、`services/planToday.ts`、`services/adaptivePlanning.ts` 与 `providers/`。完整设计（每个引擎的已交付与计划部分）见 [`docs/INTELLIGENCE.md`](docs/INTELLIGENCE.md)。

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

**今天已交付** —— 你拥有的 SQLite 文件（或单个 Cloudflare Durable Object）、单用户运行时、不可变的 `raw_inputs`、经校验与门控的模型输出、每次变更写 `action_log`，以及一道记忆门：你陈述的高置信记忆在捕获时生效，推断则等待你确认。[`SECURITY.md`](SECURITY.md) 记录了当前姿态与威胁模型。

**设计中** —— 三原则（你拥有上下文；最小数据外发；本地优先）；五级数据分类；本地智能层；带脱敏的 Privacy Gateway；本地加密存储（Keychain / Secure Enclave）；渐进式、细粒度权限且 Memory 默认私有；带四级风险的 Action Gate 与可查看、可撤销的审计日志；以及覆盖本地数据库、云同步与向量索引的删除策略。

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
| Today & planning | 空的一天得到建议；排满的一天得到休息建议 | `services/today.ts` |
| Work streams | 分组是可重建的投影；记录本身不变 | `services/workStreams.ts` |
| HTTP API | 一套 schema，两种运行时：本地 SQLite 与 Cloudflare Durable Object | `apps/server` |
| MCP server | 无需服务进程，直接读同一个本地文件 | `packages/mcp` |

流水线可离线运行：确定性 provider 与模型实现共享同一接口，因此 16 个测试套件与 11 个验收 fixture 无需任何 key 即可重放。

## 看它跑起来

```bash
git clone https://github.com/heymi/aldus-palace.git && cd aldus-palace
pnpm install

pnpm verify   # 19 个套件 + 11 个 fixture + 构建 + 校验，全部离线
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
| [MAP.md](docs/MAP.md) | 能力 → 代码 → 文档 → 测试 |
| [GLOSSARY.md](docs/GLOSSARY.md) | 术语表 |
| [EVALUATION.zh.md](EVALUATION.zh.md) | 逐条主张的验证指南 |
| [DOMAIN-SCHEMA.md](docs/DOMAIN-SCHEMA.md) | 对象、不变量、记忆演进 |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | 本地、边缘、嵌入式、备份 |
| [EVAL.md](docs/EVAL.md) | 验收 fixture 及如何新增 |
| [PROGRESSIVE-CAPTURE.md](docs/PROGRESSIVE-CAPTURE.md) | enrichment lease，写给直接照抄的人 |
| [adr/](docs/adr) | 已作出的决策与理由 |

## 仓库结构

```
packages/core          领域模型、agent 运行时、存储端口、迁移、providers
packages/mcp           MCP 服务器（stdio）——profiles、本地与 HTTP 后端
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
