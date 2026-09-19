# 评估这个项目

给人、也给 agent 的核对清单。每一条对外主张都对应一条命令或一个文件作为证据。

> 英文版见 [`EVALUATION.md`](EVALUATION.md)。

## 五分钟，不需要 API key

```bash
git clone https://github.com/heymi/aldus-palace.git && cd aldus-palace
pnpm install
pnpm verify     # 类型检查 · 套件 · fixture · 构建 · schema 校验
pnpm demo       # 离线捕获演示
```

`pnpm verify` 通过时，结尾会看到类似片段：

```
packages/core test: All 21 suites passed.
packages/mcp test: mcp tool tests passed.
apps/server test: All 3 suites passed.
All fixtures passed.
spec/schema.sql is up to date.
```

`pnpm demo` 打印的正是 README 顶部那张卡片。全程不需要 key、网络或运行中的服务。

如果你无法运行仓库，真实输出已提交在 [`examples/output/`](examples/output)（demo、套件、fixture、benchmark）与 [`docs/assets/demo.cast`](docs/assets/demo.cast)（asciinema 录像）。

## 主张 → 证据

| 主张 | 验证方式 | 预期 |
|---|---|---|
| 自由文本变成带类型的对象 | `pnpm demo` | `Captured · 1 commitment`，窗口已解析 |
| 流水线可离线运行 | `pnpm verify` | 26 个套件与 11 个 fixture 无需 key 通过 |
| `overdue` 没有可占据的状态 | `rg overdue packages/core/src/db/schema.ts` | 无匹配；状态为 `captured/planned/scheduled/completed/risk/cancelled` |
| 记忆按唯一公开规则激活 | `sed -n '19,21p' packages/core/src/lib/memoryActivation.ts` | `MEMORY_ACTIVE_THRESHOLD = 0.8` |
| 情绪句不会变成记忆 | `pnpm eval` | fixture `S04` 通过 |
| 重复项指向第一条记录 | `pnpm demo` | `Already tracked, so this repeat was skipped` |
| 日期在服务端解析 | `pnpm --filter @aldus-palace/example-capture-cli start "Ship the onboarding page next week"` | 输出窗口，而不是原句 |
| 每条记忆都带证据 | `packages/core/test/memoryEvolution.test.ts` | 断言证据与激活说明 |
| 矛盾会被标记，而不是存两份 | `packages/core/test/memoryEvolution.test.ts` | supersede 与版本链 |
| 后台增强可承受重试 | `packages/core/test/enrichmentLease.test.ts` | lease 与 generation 断言 |
| 模型提议，服务端决定 | `packages/core/test/inputObjectClassification.test.ts` | 每次捕获只有一个对象模式 |
| 缺失时长会按历史估算 | `packages/core/test/adaptivePlanning.test.ts` | 时段长度跟随项目历史中位数 |
| 规划会留出四分之一个白天 | `packages/core/test/adaptivePlanning.test.ts` | 九小时按 6.75 小时安排；排满的一天不会被继续塞满 |
| 未开始的灵活工作自动顺延，硬截止不顺延 | `packages/core/test/workMigration.test.ts` | 清空时段并计一次顺延；有截止的仍是风险；三次顺延后需要决定 |
| 被依赖阻塞的任务不会被排期 | `packages/core/test/dependencies.test.ts` | 规划器跳过；阻塞项完成后自动释放；循环依赖被拒绝 |
| Now 是当下最合适的行动，而不是排在最前的 | `packages/core/test/planningIntelligence.test.ts` | 上下文匹配胜出，理由随结果返回 |
| 一天被分为 core / optional / deferred | `packages/core/test/planningIntelligence.test.ts` | 风险项进入 core，装得下的进入 optional，其余 deferred |
| 提前完成会重排当天 | `packages/core/test/planningIntelligence.test.ts` | 完成后自动重排，下一个候选被排入 |
| 新原则的权重高于旧经历 | `packages/core/test/memoryValue.test.ts` | 等级、衰减与价值评分决定检索排序 |
| 云端调用可在离开前脱敏 | `packages/core/test/privacy.test.ts` | 名称、金额、邮箱变占位符；Level 4 不出本机 |
| 未经授权时 Memory 保持私有 | `packages/core/test/privacy.test.ts` | 默认权限不含 memory；可收回 |
| 删除是真实的 | `packages/core/test/privacy.test.ts` | 需要 `confirm`，删除后用户所有表为空 |
| 高风险 agent 动作会等待决定 | `packages/core/test/actionGate.test.ts` | 关键级需两次批准；撤销不可逆 |
| Action Gate 可在 MCP 中使用 | `packages/mcp/test/tools.test.ts` | `actions` profile 暴露 list/decide/revoke |
| 信任来自决定，而非沉默 | `packages/core/test/trustScore.test.ts` | 无证据时等级 0；六次决定、0.75 时到等级 2 |
| 自主范围只放宽到用户设定的上限 | `packages/core/test/trustScore.test.ts` | 默认上限 2；升到 3 后仍需记录达到等级 3 才放行高风险，记录下滑会回落 |
| schema 是唯一真相源 | `pnpm spec:check` | `spec/schema.sql` 与 `db/schema.ts` 一致 |
| 一份记录，三个入口 | `packages/mcp`、`apps/server`、`packages/core` | 各处使用同一 schema 与迁移 |
| MCP 工具返回可读卡片 | `pnpm --filter @aldus-palace/mcp test` | 断言卡片文本，payload 在 `structuredContent` |
| 规则层有实测数字 | `pnpm bench` | 见 [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md) |

## 给 agent 的入口

| 文件 | 用途 |
|---|---|
| [`AGENTS.md`](AGENTS.md) | 开发契约 |
| [`CLAUDE.md`](CLAUDE.md) | Claude Code 入口，导入 AGENTS.md |
| [`.cursor/rules/aldus.mdc`](.cursor/rules/aldus.mdc) | Cursor 规则 |
| [`llms.txt`](llms.txt) | 给 LLM 工具的精选索引 |
| [`llms-full.txt`](llms-full.txt) | 关键文档的拼接全文 |
| [`docs/MAP.md`](docs/MAP.md) | 能力 → 代码 → 文档 → 测试 |
| [`docs/GLOSSARY.md`](docs/GLOSSARY.md) | 术语表 |
