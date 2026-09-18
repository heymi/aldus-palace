# 03. Engineering Task Breakdown（工程任务拆解）

Version: 1.0  
Status: **Active for V1 build**  
Parents: `00-MVP-Decisions`, `01-MVP-Object-Schema`, `02-MVP-Acceptance-Scenarios`  
Last Updated: 2026-07-18

---

## 0. 文档地位

本文件把冻结决策拆成 **可排期、可勾选、有依赖** 的工程任务。

约束来源（冲突时以下为准）：

```text
00 Decisions → 01 Schema → 02 Acceptance → 03 本文件（实现顺序，不得扩 scope）
```

### 技术选型（V1 默认，可替换实现但不可换产品语义）

| 层 | 选型 |
|----|------|
| Client | macOS，SwiftUI + Swift Concurrency |
| API | HTTPS JSON API（语言不限：建议 TypeScript/Node 或 Python FastAPI） |
| DB | PostgreSQL |
| Vector | pgvector（优先）或独立 Vector DB |
| Agent Runtime | 云端服务进程 |
| LLM | `LLMProvider` 接口 + 单一 `DeepSeekProvider`（或当前选定主模型） |
| Embedding | 单一 embedding 模型，经同一抽象或旁路 `EmbeddingProvider` |
| Auth | 单用户/个人账号（Email magic link 或 OAuth）；V1 不做团队 |
| Calendar | Phase 0 可 mock；Phase 1：EventKit（Apple）优先，Google 次之 |

### 工作流原则

1. **Data model first**：库表/迁移 → API → Agent → UI  
2. 每个 Phase 结束必须能 **演示闭环**，不是只合代码  
3. 任务完成定义 = 对应 **Acceptance ID** 可测，或标注 N/A  
4. 禁止顺手做：Recurring、Horizon、外部执行、Kanban、多模型全接

### 任务 ID 前缀

| 前缀 | 领域 |
|------|------|
| INF | 基础设施 |
| DB | 数据模型 |
| API | 后端 API |
| AG | Agent Runtime |
| PL | Planning |
| MEM | Memory pipeline |
| CAL | Calendar |
| MAC | macOS Client |
| EVAL | 评测与质量 |
| REL | 发布与运维 |

**估计**：S（≤1d）/ M（2–3d）/ L（4–7d）/ XL（>1w）— 单人参考，非合同。

---

## 1. Phase 地图

```text
Phase 0  Vertical Slice（约 2–4 周）
  目标：Capture → Understand → 落库对象 → 简单列表
  验收：S01 S02 S04 S05 S06 S09 S10 S37（核心）

Phase 1a Today + Execute（约 2–3 周）
  目标：Today/Now/Timeline、开始/稍后/完成、ActionLog
  验收：S16 S21–S23 S33 S35 + 基础规划

Phase 1b Planning + Calendar Read（约 2–3 周）
  目标：空闲检测、AI Slot、错过 Slot≠Risk、Deadline Risk
  验收：S13 S14 S17 S18 S20

Phase 1c Memory + Projects + Polish（约 2–3 周）
  目标：Memory 门禁、Project 容器、Activity、日历写可选
  验收：S11 S12 S25–S31 S14/S15 S34 S36 S38

Phase 1d Hardening（约 1–2 周）
  目标：P0 全绿、eval CI、真实自用一周
  验收：§13 P0 清单
```

Phase 2+（仅占位，本文件不拆细）：Horizon、Recurring、Relationship、Local model 层、Trust score 动态升级。

> **当前执行说明（2026-07-18）**：上面的 Phase 仍定义 V1 能力范围，但仓库已经出现
> 「Phase 0/1a 稳定性未收口、Memory/Concept 提前实现」的交叉状态。接下来不再按绿地项目周次推进，
> 以 §9 的里程碑和 §11 的 `EX-*` 任务为唯一当前执行顺序；未通过前一里程碑退出门槛，
> 不继续扩展新的 Memory/Concept 表面或精确 Planner。

---

## 2. Phase 0 — Vertical Slice

> 没有漂亮 UI 也可以；必须证明「一句话 → 结构化对象」可信。

### 2.1 Infrastructure

| ID | Task | Size | Depends | Done when |
|----|------|------|---------|-----------|
| INF-01 | 仓库结构：`apps/macos`, `services/api`, `packages/shared-types`（可选）, `docs` | S | — | monorepo 或双仓边界清晰；README 能本地启动 API |
| INF-02 | 本地 PostgreSQL + 迁移工具（Prisma/Drizzle/Alembic/Flyway 任选） | S | INF-01 | `migrate up` 空库成功 |
| INF-03 | API 骨架：health、config、错误格式统一 | S | INF-01 | `GET /health` 200 |
| INF-04 | 环境变量：DB、LLM key、embedding；**.env.example** 无密钥 | S | INF-03 | 文档可复制启动 |
| INF-05 | HTTPS 本地可自签；生产 TLS 终止方案笔记 | S | INF-03 | 开发可用 |
| INF-06 | 基础 Auth：创建用户 / 会话 token（JWT 或 session） | M | DB-01 | 受保护路由 401/200 正确 |
| INF-07 | 请求日志 + request_id | S | INF-03 | 可追踪一次 Capture |

### 2.2 Database（严格按 01）

| ID | Task | Size | Depends | Done when |
|----|------|------|---------|-----------|
| DB-01 | 表 `users`（含 timezone, language, calendar_write_enabled 默认 false） | S | INF-02 | 迁移可应用 |
| DB-02 | 表 `raw_inputs` | S | DB-01 | CRUD 级插入测试 |
| DB-03 | 表 `projects` | S | DB-01 | |
| DB-04 | 表 `thoughts`（type/status 枚举约束） | S | DB-01 | DB check 拒绝非法 type |
| DB-05 | 表 `commitments`（deadline/window/ai_slot 字段） | S | DB-01 | |
| DB-06 | 表 `decisions` | S | DB-01 | |
| DB-07 | 表 `memories`（type 四类 + status candidate/active/archived） | S | DB-01 | |
| DB-08 | 表 `events` | S | DB-01 | |
| DB-09 | 表 `action_logs` | S | DB-01 | |
| DB-10 | 必要索引（01 §17） | S | DB-02–09 | explain 基本查询可用 |
| DB-11 | （可选 Phase 0 末）`embeddings` + pgvector | M | DB-07 | 维度固定可插入 |

**禁止**：task/notes 表、recurrence 表、identity memory type。

### 2.3 API — Core

| ID | Task | Size | Depends | Done when | Accept |
|----|------|------|---------|-----------|--------|
| API-01 | `POST /inputs` 创建 RawInput（pending） | M | DB-02, INF-06 | 落库 | S01 |
| API-02 | `POST /inputs/{id}/process` 或创建时异步 process | M | API-01, AG-03 | status processed/failed | S01 S03 |
| API-03 | `GET /thoughts` 列表 | S | DB-04 | 按 created_at | |
| API-04 | `GET /commitments` 列表 + 按 status 过滤 | S | DB-05 | | |
| API-05 | `GET /inputs/{id}` 含关联对象 id | S | API-02 | | |
| API-06 | Action Card DTO：统一 process 响应结构 | M | API-02 | 客户端可直接渲染 | S01 |
| API-07 | `POST /action-logs` 内部用；列表 `GET /activity` | S | DB-09 | | S33 雏形 |
| API-08 | 用户资料 `GET/PATCH /me`（timezone 等） | S | DB-01 | | |

### 2.4 Agent Runtime

| ID | Task | Size | Depends | Done when | Accept |
|----|------|------|---------|-----------|--------|
| AG-01 | `LLMProvider` 接口：`complete(messages, schema?)` | S | INF-04 | mock provider 可单测 | |
| AG-02 | `DeepSeekProvider`（或选定）实现 + 超时/重试 | M | AG-01 | 真实调用成功 | |
| AG-03 | **Understand pipeline**：RawInput → JSON 抽取 | L | AG-02, DB-* | 写 thoughts/commitments/decisions/memory **candidates** | S04–S06 S09 |
| AG-04 | JSON Schema / structured output 校验；失败标 failed | M | AG-03 | 非法 JSON 不脏写 | S03 |
| AG-05 | 类型门禁：Thought 5 种、Memory 4 种；拒绝 principle thought | S | AG-03 | 单测 | S10 S31 |
| AG-06 | 规则：**不确定 → 不建 Commitment**（prompt + 后处理） | M | AG-03 | 夹具 S04 S09 | S04 S09 |
| AG-07 | 时间解析：deadline/window 按时区写库 | M | AG-03, API-08 | S05 样例 | S05 |
| AG-08 | 每次 process 写 ActionLog（objects_extracted 等） | S | AG-03, DB-09 | | |
| AG-09 | Prompt 分包：system 产品规则 / 不塞全历史 | M | AG-03 | 无巨型单 prompt 文件泥球 | |

**Phase 0 Agent 不做**：完整 Planning 优化、Memory 自动 active、日历读写、外部 tool calling 发信。

### 2.5 macOS Client — Slice

| ID | Task | Size | Depends | Done when | Accept |
|----|------|------|---------|-----------|--------|
| MAC-01 | Xcode 工程 + 登录/存 token | M | API-08 | 可调 health + me | |
| MAC-02 | 主窗口导航壳：Today / Thoughts / Projects / Memory / Activity / Capture | M | MAC-01 | 可切换空页 | S35 |
| MAC-03 | Capture 输入框 + 提交 → `POST /inputs` + process | M | API-01/02 | | S01 S02 |
| MAC-04 | Action Card 展示创建结果（Thought/Commitment/Memory candidate） | M | API-06 | | S01 S06 |
| MAC-05 | Thoughts 列表（时间流） | S | API-03 | | S36 基础 |
| MAC-06 | Commitments 简单列表 | S | API-04 | | |
| MAC-07 | 错误态 + 重试 process | S | API-02 | | S03 |

### 2.6 Eval — Phase 0

| ID | Task | Size | Depends | Done when | Accept |
|----|------|------|---------|-----------|--------|
| EVAL-01 | 夹具目录 `eval/fixtures/*.json`（至少 S04 S05 S06 S09 S10 S25） | M | AG-03 | 可跑脚本 | |
| EVAL-02 | Runner：调 Understand（可 mock LLM 或金标 JSON） | M | EVAL-01 | CI 可跑 deterministic 子集 | |
| EVAL-03 | Phase 0 Demo 脚本：3 条输入 → 截图/日志 | S | MAC-04 | 能给自己用 | S37 |

### Phase 0 Exit

- [ ] 文本 Capture 闭环稳定  
- [ ] 混合输入稳定拆出 Thought+Commitment  
- [ ] 无非法 Thought/Memory type  
- [ ] Memory 若出现则为 **candidate**  
- [ ] macOS 能看列表与 Card  
- [ ] EVAL 核心夹具绿  

---

## 3. Phase 1a — Today + User Execute

| ID | Task | Size | Depends | Done when | Accept |
|----|------|------|---------|-----------|--------|
| API-10 | `GET /today`：now + timeline_items + risks（服务端组装） | L | DB-05, DB-08 | 契约稳定 | S16 S18 |
| API-11 | `POST /commitments/{id}/start` | S | DB-05 | started_at | S21 |
| API-12 | `POST /commitments/{id}/complete` | S | DB-05 | completed | S23 |
| API-13 | `POST /commitments/{id}/snooze`（延后 slot 或标记） | M | DB-05 | | S22 |
| API-14 | `PATCH /commitments/{id}` 用户改 title/deadline/window | M | DB-05 | | S34 部分 |
| PL-01 | 无日历时的 **naive planner**：按 importance/deadline/window 填 ai_slot | M | DB-05 | 有 slot 或明确 null | S20 |
| PL-02 | Risk 规则：仅 deadline 路径进 risk（实现 01 语义） | M | DB-05 | 单测 | S17 S18 |
| PL-03 | 禁止「过期 ai_slot → risk」 | S | PL-02 | 单测 | S17 |
| MAC-10 | Today 页：Now / Timeline / Risks | L | API-10 | | S16 |
| MAC-11 | Now 操作：开始 / 稍后 / 完成 | M | API-11–13 | | S21–23 |
| MAC-12 | Activity 页读 `GET /activity` | S | API-07 | | S33 |
| AG-10 | process 后可选触发 `plan_today`（异步） | M | PL-01, AG-03 | | |
| EVAL-10 | 夹具：S17 S18 状态机 | S | PL-02 | | |

### Phase 1a Exit

- [ ] 每天打开 Today 知道 Now  
- [ ] 完成/稍后改变状态正确  
- [ ] 错过 AI Slot 不进 Risk  

---

## 4. Phase 1b — Planning + Calendar Read

| ID | Task | Size | Depends | Done when | Accept |
|----|------|------|---------|-----------|--------|
| CAL-01 | 日历抽象 `CalendarProvider`：listEvents(range) | S | — | mock 实现 | |
| CAL-02 | **Mock provider** + 种子会议数据（dev） | S | CAL-01 | 本地可测 S13 | |
| CAL-03 | macOS **EventKit** 只读同步 → upsert `events` | L | CAL-01, DB-08, MAC-01 | 授权流程 | S13 |
| CAL-04 | `POST /calendar/sync` 拉取写入 events | M | CAL-03 或 mock | | |
| CAL-05 | Google Calendar 只读（可排在 EventKit 后） | L | CAL-01 | 可选 P1 | |
| PL-10 | Planner 输入：commitments + fixed events + timezone | M | CAL-04, DB-05 | | S13 |
| PL-11 | 空闲扫描：不与 fixed_external 重叠分配 ai_slot | L | PL-10 | 单测密集 | S13 |
| PL-12 | 会议变更后 replan 冲突 slot | M | PL-11, CAL-04 | | S19 |
| PL-13 | ActionLog：plan_generated / ai_slot_adjusted + reason | S | PL-11, DB-09 | | S33 |
| API-20 | `POST /plan/today` 显式触发 | S | PL-11 | | |
| MAC-20 | 日历授权 UI + 同步状态 | M | CAL-03 | | S20 对照 |
| MAC-21 | Timeline 视觉：Fixed / Flexible / Suggested | M | API-10 | | S13 |
| EVAL-20 | S13 时间不重叠断言 | M | PL-11 | | |

### Phase 1b Exit

- [ ] 有会议日不会把工作排进会议  
- [ ] 无日历仍可用（S20）  
- [ ] 默认不写系统日历（S14）  

---

## 5. Phase 1c — Memory + Projects + Calendar Write Optional

### Memory

| ID | Task | Size | Depends | Done when | Accept |
|----|------|------|---------|-----------|--------|
| MEM-01 | AG 抽取只写 `status=candidate` | S | AG-03 | 不变量测试 | S25–S26 |
| MEM-02 | `POST /memories/{id}/confirm` → active + confirmed_at | S | DB-07 | | S27 |
| MEM-03 | `POST /memories/{id}/reject` → archived | S | DB-07 | | S28 |
| MEM-04 | `GET /memories?status=&type=` | S | DB-07 | | |
| MEM-05 | 临时状态启发式：**不**为「我今天累」建长期 preference（prompt+规则） | M | MEM-01 | 夹具 S30 | S30 |
| MEM-06 | Embedding 索引 active memory；检索 top-k 注入 Understand/Plan context | L | DB-11, MEM-02 | 召回可测 | S29 部分 |
| MEM-07 | Decision 创建时可提议 memory candidate | M | AG-03, DB-06 | | S32 |
| MAC-30 | Memory 页：分组 + 确认/丢弃 | M | MEM-02–04 | | S25–S28 |
| MAC-31 | Action Card 上确认 memory candidate | S | MAC-04, MEM-02 | | |

### Projects

| ID | Task | Size | Depends | Done when | Accept |
|----|------|------|---------|-----------|--------|
| API-30 | CRUD `projects`（无 board 字段） | S | DB-03 | | S12 |
| AG-20 | 名称/关键词关联 `project_id`；无匹配则 null（PS1） | M | API-30, AG-03 | | S11 |
| MAC-32 | Projects 页：详情为关联列表非 Kanban | M | API-30 | | S12 |

### Calendar write optional

| ID | Task | Size | Depends | Done when | Accept |
|----|------|------|---------|-----------|--------|
| API-31 | `PATCH /me` 设 `calendar_write_enabled` | S | DB-01 | 默认 false | S14 |
| CAL-10 | 写路径：仅 enabled 时创建 `ai_work_block` + EventKit/Google insert | L | CAL-03, API-31 | | S15 |
| CAL-11 | 关闭时集成测试：零外部写 | S | CAL-10 | | S14 |
| MAC-33 | 设置项：允许写入日历（文案强调信任） | S | API-31 | | |

### Polish

| ID | Task | Size | Depends | Done when | Accept |
|----|------|------|---------|-----------|--------|
| MAC-34 | 空 Today 引导 Capture | S | MAC-10 | | S38 |
| MAC-35 | Menu Bar：Capture + Now 只读/快捷入口 | L | MAC-03, API-10 | P1 | |
| MAC-36 | 全局快捷键 Capture | M | MAC-35 | P1 | |
| MAC-37 | 修正错误抽取：删除/cancel 对象 | M | API-14 | | S34 |
| AG-21 | 高风险意图（发邮件等）只建 Thought/Commitment「准备」，不调外部 tool | M | AG-03 | | S24 |
| EVAL-30 | P0 夹具全集自动化 | L | EVAL-* | | 发布门槛 |

### Phase 1c Exit

- [ ] Memory 确认门禁无旁路  
- [ ] Project 是容器不是 PM  
- [ ] 日历写可选且默认关  
- [ ] P0 场景可演示  

---

## 6. Phase 1d — Hardening & Self-Use

| ID | Task | Size | Depends | Done when |
|----|------|------|---------|-----------|
| REL-01 | 部署 API（单机 Docker Compose：api+postgres 足够） | M | INF-* | 自己账号可用 |
| REL-02 | 密钥管理（LLM key 不进客户端） | S | REL-01 | 客户端仅 session |
| REL-03 | 备份 Postgres 策略笔记 + 脚本 | S | REL-01 | |
| REL-04 | 基础 rate limit / 用户级配额防 LLM 刷爆 | S | INF-06 | |
| REL-05 | 删除账号/导出数据最小实现（隐私叙事） | M | DB-* | P1 |
| EVAL-40 | 对照 `02` §13：**全部 P0 勾选** | M | all | 签字清单 |
| EVAL-41 | 创始人真实自用 ≥7 天；记 3 个最大摩擦点 | XL | REL-01 | 反馈进 backlog |
| MAC-40 | 崩溃与网络错误体验 | M | MAC-* | |
| AG-30 | Prompt/规则回归：改 prompt 必须跑 EVAL | S | EVAL-30 | 流程固定 |

### V1 Release Gate

- [ ] `02` 全部 P0 通过  
- [ ] 无外部自动执行路径  
- [ ] `calendar_write_enabled` 默认 false  
- [ ] Memory 无静默 active  
- [ ] 自用一周不崩溃、愿每日 Capture  

---

## 7. 跨切面任务（贯穿各 Phase）

| ID | Task | When | Notes |
|----|------|------|-------|
| XF-01 | OpenAPI / 类型共享（Swift 可手写或生成） | Phase 0 起 | 防前后端漂移 |
| XF-02 | 枚举单一来源（thought type 等） | DB-04 时 | 与 01 一致 |
| XF-03 | 结构化日志：input_id, user_id, latency_ms, model | AG-02 起 | |
| XF-04 | LLM 费用与 token 日统计 | Phase 1a | |
| XF-05 | 隐私：发往 LLM 的 payload 最小化（日历只摘要忙闲） | PL-10 | 对齐安全原则 |
| XF-06 | 功能开关：voice_input, google_calendar, calendar_write | Phase 1 | |

---

## 8. 明确不排期（防 scope creep）

```text
❌ Recurring / RecurrenceRule
❌ Horizon UI
❌ iOS 完整 App（除非 Phase 0 后有余力只做 Capture）
❌ 邮件 Agent / 自动发送
❌ Kanban / Sprint
❌ Graph DB
❌ 多 LLM 热切换产品化
❌ Identity Memory 表
❌ Trust score 驱动权限自动升级
❌ 本地模型敏感层（架构预留即可）
❌ 企业 SSO / 协作
```

---

## 9. 当前执行里程碑（审查后）

本顺序综合 CTO、Swift/macOS 技术与产品审查。工程保障从 M0 起持续推进；每个产品里程碑
必须交付一个用户可感知的闭环，不能连续数周只做横向重构。

| Milestone | 目标 | 必须交付 | 进入下一阶段的门槛 |
|-----------|------|----------|--------------------|
| M0 信任重置 | 不丢、不重、不静默替用户决定 | enrich 幂等与原子替换、相对时间修复、Thought 派生修复、Today 纯读、禁止过去 Slot | `EX-001`–`EX-005` 全部验收 |
| M1 Personal OS 最小证明 | 证明不是 Todo / Notes | 统一契约、四类 Memory、理解纠错/撤销、确认后召回并展示依据 | `EX-006`–`EX-008` 全部验收 |
| M2 每日行动闭环 | 每天打开后知道现在做什么且可以协商 | Today 默认入口、Now 唯一、Start/Later/Complete、Swift 状态边界、运行可观测性 | `EX-009`–`EX-011` 全部验收 |
| M3 数据基础切换 | 结束 SQLite/PostgreSQL 双轨风险 | 版本化迁移、现有数据导入、备份恢复、PostgreSQL 行为一致 | `EX-012` 验收；Calendar 不得提前接入生产路径 |
| M4 现实约束 | 读取真实时间边界但默认零外部写 | EventKit 只读、幂等同步、权限降级、忙闲最小化 | `EX-013` 验收 |
| M5 可信规划 | 建议不在过去、不与现实冲突 | 显式 Planner、固定事件约束、重排解释、用户安排优先 | `EX-014` 验收 |
| M6 认知建议与 Beta | 用已确认上下文改善建议并可持续自用 | Memory/Project Context 影响 Now、引用可解释、连续自用与发布门禁 | `EX-015` 验收 |

### 当前 Beta 明确后置

- Calendar Write 与 Google Calendar：只读 EventKit 证明价值后再决策。
- pgvector/embedding：少量 Active Memory 先用可解释规则召回验证。
- 可见 Concept 管理、Graph UI、Gravity、主动洞察：不进入当前 Beta。
- Menu Bar / 全局快捷键：主窗口 Capture/Today 闭环稳定后再排。
- 大规模通用 Repository、Event Bus、复杂 Agent 框架：不因“拆大文件”引入。

---

## 10. Acceptance ↔ 工程映射（P0 速查）

| Accept | 主要任务 |
|--------|----------|
| S01 S02 | API-01, MAC-03/04 |
| S03 | API-02, AG-04, MAC-07 |
| S04 S09 | AG-06, EVAL-01 |
| S05 | AG-07 |
| S06 | AG-03, EVAL-01 |
| S10 S31 | AG-05, DB constraints |
| S12 | MAC-32, API-30 |
| S13 | PL-11, CAL-*, MAC-21 |
| S14 | API-31, CAL-11, User default |
| S16 | API-10, MAC-10 |
| S17 S18 | PL-02/03 |
| S20 | PL-01, MAC-20 空态 |
| S21–S23 | API-11–13, MAC-11 |
| S24 | AG-21 |
| S25–S28 S30 | MEM-* , MAC-30 |
| S33 | API-07, PL-13, MAC-12 |
| S35 | MAC-02 |
| S37 | EVAL-03, MAC-03 |

---

## 11. 当前可执行任务（`EX-*`）

任务按依赖顺序排列。每个任务应作为一个独立分支/Issue 实施，完成行为测试、代码审查和
对应端到端验证后再合并；不得把未关联的大规模重构混入任务。

### 总览

| ID | 任务 | Blocked by | 主要验收 |
|----|------|------------|----------|
| EX-001 | 建立核心行为回归门禁 | None | 已复现缺陷先变成稳定红测 |
| EX-002 | enrich 单所有者与原子派生替换 | EX-001 | 并发十次只有一个有效 generation |
| EX-003 | Swift enrich 单飞与失败恢复 | EX-002 | 刷新/多窗口不重复 POST |
| EX-004 | 修复相对时间与 Thought 派生语义 | EX-001 | 不崩溃、不强建、混合 Thought 保留 |
| EX-005 | 拆分 Today 查询与规划命令 | EX-001 | GET 零写入、无过去 Slot |
| EX-006 | 冻结共享契约与 V1 枚举 | EX-002, EX-004, EX-005 | Swift/API/DB 契约一致 |
| EX-007 | AI 理解纠错、取消与撤销闭环 | EX-006 | 用户可纠正错误对象且无幽灵数据 |
| EX-008 | 最小 Memory 确认—召回—引用闭环 | EX-006 | 未确认不召回，已确认可解释引用 |
| EX-009 | 完成 Today Start/Later/Complete | EX-005, EX-006 | S16–S18、S21–S23 全绿 |
| EX-010 | 收紧 macOS 状态与配置边界 | EX-003, EX-006, EX-009 | Today 默认、状态可恢复、凭据不硬编码 |
| EX-011 | 运行可观测性、LLM 韧性与生产安全基线 | EX-006 | 请求可追踪、超时可降级、日志无敏感正文 |
| EX-012 | PostgreSQL cutover 与数据恢复 | EX-006, EX-011 | 迁移/导入/备份恢复和核心行为一致 |
| EX-013 | EventKit 只读同步垂直切片 | EX-010, EX-012 | 幂等事件同步、拒绝权限仍可用、零系统写入 |
| EX-014 | 约束感知 Planner | EX-009, EX-013 | Slot 不冲突、可解释、用户安排优先 |
| EX-015 | 认知驱动建议与可自用 Beta | EX-007, EX-008, EX-011, EX-012, EX-014 | 已确认上下文改善 Now，连续自用通过 |

### EX-001 — 建立核心行为回归门禁

**目标**：先把已经确认的失败变成一条稳定、快速、可在 CI 运行的反馈链。

**端到端范围**：

- 新增临时数据库 API 集成测试入口，不读取或修改开发者真实 `paos.db`。
- 覆盖并发 enrich、凌晨「明天/后天」、混合 Thought+Commitment、GET Today 副作用、过去 Slot。
- 补齐 S10、S17、S18、S21–S23 fixture；修复 eval 中未生效的 allowed-type 断言。
- 把 TypeScript、eval、集成测试和 macOS build 加入统一验证清单。

**验收标准**：

- [ ] 修复代码前，新增测试能稳定复现已确认缺陷。
- [ ] 测试使用独立临时数据库且可重复运行。
- [ ] 非法 Thought/Memory type 必然使 eval 失败。
- [ ] CI 失败能指出对应 Acceptance ID 或行为名称。

**验证**：`npm run typecheck`、`npm run test:time`、`npm run eval`、新增的
`npm run test:integration`，以及无签名 macOS Debug build。

### EX-002 — enrich 单所有者与原子派生替换

**目标**：一个 Input 的同一轮 AI 富化只能有一个写入所有者，失败时保留上一套完整结果。

**端到端范围**：

- 引入 `generation_id` 与原子 lease/CAS；重复请求返回当前状态而不是再次执行。
- LLM 网络调用保持在事务外；写入前重新验证 generation 所有权。
- 派生对象替换、Input 状态与 ActionLog 在一个短事务提交。
- 不再「先删除旧结果，再逐条写入新结果」；失败不得暴露半套 generation。
- 只抽出本任务需要的 `EnrichmentCoordinator` 与 `ExtractionPersistence` seam。

**验收标准**：

- [ ] 同一 Input 并发请求 enrich 10 次，只产生一个有效 generation。
- [ ] `thought_created` 等 ActionLog 数量与实际对象一致。
- [ ] 在任一派生写入点注入失败，旧 generation 仍完整可读。
- [ ] 重试不会重复创建 Commitment、Memory Candidate 或 Clarification。

### EX-003 — Swift enrich 单飞与失败恢复

**目标**：Swift 客户端只观察富化进度，不通过轮询制造第二个执行者。

**端到端范围**：

- 对单个 Input 合并并发 Task；只在服务端明确允许的状态触发一次 enrich。
- `enriching` 只轮询状态，不再重复 POST；视图刷新和多窗口共享同一任务。
- 区分超时、可重试失败和本地结果可继续使用三种 UI 状态。
- 保留 Action Card，网络失败不能清空已显示的本地理解。

**验收标准**：

- [ ] 快速刷新、重复点击、多窗口和重启不会创建重复对象。
- [ ] 90 秒等待期间最多一次主动 enrich POST。
- [ ] 超时后用户仍可看到 RawInput 与本地 Action Card，并可显式重试。
- [ ] Swift 并发测试覆盖任务合并和取消。

### EX-004 — 修复相对时间与 Thought 派生语义

**目标**：时间歧义不能导致崩溃或伪造 Commitment，混合输入不能被压扁成 Todo。

**端到端范围**：

- 修复凌晨补偿分支的 Commitment 参数错误。
- 只有明确行动意图才允许创建轻量 Commitment；「明天见」等输入不强建。
- Clarification 解析与对象创建保持可重试、幂等。
- 只把实际派生出 Commitment/Decision 的 Thought 标为 `converted`。

**验收标准**：

- [ ] 本地 00:00–05:00 的「明天/后天」场景不崩溃。
- [ ] 无行动意图时不创建 Commitment。
- [ ] S06 同时保留可继续发展的 Thought 与对应 Commitment。
- [ ] Thought 与 Commitment 的派生关系可精确解释。

### EX-005 — 拆分 Today 查询与规划命令

**目标**：读取 Today 不改变任何持久状态；规划是显式、幂等、可解释的命令。

**端到端范围**：

- `GET /today` 只组装 Now、Timeline、Risks 和未排期摘要。
- 增加显式 `POST /plan/today`，使用 `plan_version` 保证幂等。
- 无日历阶段只根据 current time、timezone、duration、deadline/window 给粗粒度建议或 null。
- 禁止过去 Slot；用户手动窗口/安排优先于 AI 建议。
- Slot 更新与 `plan_generated`/`ai_slot_adjusted` ActionLog 原子提交。

**验收标准**：

- [ ] 调用 GET 前后数据库逐表一致。
- [ ] 21:00 规划不会生成当天 10:00 Slot。
- [ ] 重复 POST 同一 `plan_version` 不重复改写或记录日志。
- [ ] 无可用时段时明确返回 null，不伪造精确安排。

### EX-006 — 冻结共享契约与 V1 枚举

**目标**：数据库、API、Agent 与 Swift 使用同一份可验证契约。

**端到端范围**：

- 为 Input、Action Card、Thought、Commitment、Memory、Today、Event 建立 OpenAPI/JSON Schema。
- 生成或验证 Swift DTO；契约变更进入 CI diff 门禁。
- V1 Memory 恢复为 `preference/project_context/principle/decision` 四类。
- 统一错误 envelope、处理状态、ActionLog action type 与时间字段语义。

**验收标准**：

- [ ] `experience` 不能从 DB、API、Agent 或 Swift 产品表面进入 V1。
- [ ] 非法枚举在数据库与 API 边界均被拒绝。
- [ ] Swift 对 staging/local API 的契约测试通过。
- [ ] 新增字段必须同时更新契约与兼容策略。

### EX-007 — AI 理解纠错、取消与撤销闭环

**目标**：用户能纠正「这是想法，不是承诺」等错误，系统不留下幽灵对象。

**端到端范围**：

- Action Card 支持修改类型/标题/时间、取消错误对象和撤销最近一次纠正。
- 纠正动作更新关联对象和派生关系，并写用户可理解的 ActionLog。
- 撤销恢复完整前态；已被后续动作依赖时返回明确冲突而非静默覆盖。
- 将纠正记录作为后续质量评测信号，暂不自动生成永久 Memory。

**验收标准**：

- [ ] 用户可把误建 Commitment 改回 Thought 或取消。
- [ ] 纠正后 Today、Projects、Activity 不出现幽灵对象。
- [ ] 每次纠正和撤销只有一条对应 ActionLog。
- [ ] 重启后结果与操作完成时一致。

### EX-008 — 最小 Memory 确认—召回—引用闭环

**目标**：证明系统会记住用户确认过的背景，而不是只增加一个 Memory 列表。

**端到端范围**：

- 保持 Candidate → Confirm → Active 硬门禁；未确认内容不进入长期上下文。
- 使用少量、可解释的规则召回 Active Memory 和 Project Context，暂不依赖 embedding。
- Action Card/理解结果返回引用的 Memory、来源和命中原因。
- 移除 Nimbus/Lumen 等具体产品硬编码；项目语境来自用户数据。
- 用户可停用错误 Active Memory，后续请求立即不再引用。

**验收标准**：

- [ ] 确认「项目坚持隐私优先」后，下一次相关 Capture 可见引用依据。
- [ ] 同内容 Candidate 未确认时不影响理解。
- [ ] 停用 Memory 后不再进入下一次 Agent 上下文。
- [ ] 用户不需要创建或维护 Concept 才能获得召回价值。

### EX-009 — 完成 Today Start/Later/Complete

**目标**：Now 是可以协商的下一步，而不是只能执行或拒绝的任务卡。

**端到端范围**：

- 实现 Start、Later、Complete 的合法状态转换和幂等 API。
- Later 延后建议或让出 Now，但不因该动作进入 Risk。
- Now 永远只突出一件；Risks 只使用真实 deadline 风险。
- macOS 支持乐观反馈，但服务端失败必须回滚到确认状态。

**验收标准**：

- [ ] S16–S18、S21–S23 全绿。
- [ ] 重复点击或网络重试不会产生重复转换/ActionLog。
- [ ] Later 后 Now 可选择下一候选，原 Commitment 保持可追踪。
- [ ] Start/Later/Complete 重启后状态一致。

### EX-010 — 收紧 macOS 状态与配置边界

**目标**：保持 SwiftUI 简单，同时避免所有页面、网络和长任务继续堆进单一 AppState。

**端到端范围**：

- `AppState` 保留应用级协调，按交付切片抽出 `CaptureStore`、`TodayStore`、`MemoryStore`、`CalendarStore`。
- Store 运行在 `@MainActor`；共享网络/任务协调使用 actor 或等价安全边界。
- 默认入口改为 Today；Work 作为 Today/Projects 下钻工作池，不再作为一级主场。
- API base URL 使用构建/环境配置；生产凭据进入 Keychain，移除硬编码 dev token。

**验收标准**：

- [ ] 启动默认进入 Today，Capture 仍可一跳到达。
- [ ] 多窗口/刷新不制造重复网络副作用。
- [ ] 离线、超时、取消和服务端回滚 UI 状态一致。
- [ ] Release 构建中不存在 localhost 或明文 dev token。

### EX-011 — 运行可观测性、LLM 韧性与生产安全基线

**目标**：从一次 Capture 能追踪到处理 generation 和计划版本，同时不把私人正文写入运维日志。

**端到端范围**：

- 串联 `request_id → input_id → generation_id → plan_version`。
- LLMProvider 增加 timeout、有限重试、取消、错误分类、latency/token/cost 统计。
- 区分用户 ActionLog 与运维结构化日志；日志默认不记录 RawInput、Memory 正文或日历标题。
- 生产环境使用真实 session/auth、限制 CORS、服务端保管 LLM 密钥并增加基础 rate limit。

**验收标准**：

- [ ] LLM 超时在限定时间内降级到可继续使用的本地结果。
- [ ] 一次 Capture 可通过 correlation id 完整追踪。
- [ ] 日志抽检无敏感正文和密钥。
- [ ] 生产配置拒绝 dev token、`CORS *` 和客户端 LLM key。

### EX-012 — PostgreSQL cutover 与数据恢复

**目标**：在 Calendar/Planner 扩展前结束临时 schema patch 和长期双存储漂移。

**端到端范围**：

- 引入正式版本化 migration，空库可从零升级。
- 提供 SQLite → PostgreSQL 导入工具和迁移前备份步骤。
- 校验行数、外键、枚举、关键关联和核心查询结果。
- Capture、enrich、Today、Memory confirm 集成测试切换到 PostgreSQL。
- 完成一次备份恢复和失败迁移回滚演练。

**验收标准**：

- [ ] 空库 migrate 成功且约束与 `01` 一致。
- [ ] 现有数据导入后关键数据与查询一致。
- [ ] 核心行为测试在 PostgreSQL 全绿。
- [ ] 备份实际恢复成功；失败迁移有可执行回滚路径。
- [ ] SQLite 不作为生产运行时长期保留。

### EX-013 — EventKit 只读同步垂直切片

**目标**：让 Planner 看到现实忙闲约束，同时保持 macOS-first、最小上传和默认零外部写。

**数据流**：

```text
EventKit Adapter (macOS)
  → normalized busy/event DTO
  → Calendar Sync API
  → events
  → Planner
```

**端到端范围**：

- macOS 请求只读权限并读取指定时间范围。
- 规范化全天、重复、跨时区事件；以稳定 external id 幂等同步。
- 服务端支持新增、更新、删除/取消语义和同步游标。
- 默认只上传 Planner 必需的忙闲摘要；日历标题不进入 LLM。
- 权限拒绝或撤销时产品仍可 Capture、Memory 和使用粗粒度 Today。

**验收标准**：

- [ ] 同一批 EventKit 数据重复同步不重复建 Event。
- [ ] 新增、变更、删除、全天、重复、DST 和跨时区均有测试。
- [ ] 权限拒绝/撤销不崩溃且降级说明清楚。
- [ ] `calendar_write_enabled=false` 下没有任何系统日历写入路径。

### EX-014 — 约束感知 Planner

**目标**：AI 建议尊重当前时间、现实会议与用户手动安排，并能说明为什么变化。

**端到端范围**：

- Planner 输入包含 Commitments、fixed events、timezone、duration、deadline/window。
- 扫描空闲区间并生成不重叠、不在过去的 Suggested Slot。
- 会议变化只重排受影响 Slot；用户手动安排始终优先。
- 错过 Suggested Slot 不进入 Risk；真实 deadline 危险窗口才进入 Risks。
- `plan_version`、reason、override/undo 贯穿 API、ActionLog 与 macOS Timeline。

**验收标准**：

- [ ] S13、S14、S17–S20 全绿。
- [ ] 所有 Slot 容纳 duration、不在过去且不与 fixed event 重叠。
- [ ] 相同输入得到可重复、可解释的计划。
- [ ] 会议变化只调整受影响项，并展示原因。
- [ ] 用户手动修改不会被后台静默覆盖。

### EX-015 — 认知驱动建议与可自用 Beta

**目标**：从「会排」升级为「理解为什么这样建议」，并达到持续真实使用门槛。

**端到端范围**：

- 已确认 Memory、Project Context 与 Decision 参与 Now/Planner 理由。
- macOS 展示引用的 deadline、项目背景或用户原则；允许停用错误引用。
- Concept 仅作为内部 linking，不增加用户管理负担或 Graph UI。
- 完成失败注入、性能、数据导出/删除、备份恢复和生产安全检查。
- 从 M0 后持续记录自用反馈；Beta 前完成连续 7 天稳定使用并只收敛前三大摩擦点。

**验收标准**：

- [ ] 未确认 Memory 永远不影响 Now/Planner。
- [ ] 每个认知驱动建议可说明来源与命中原因。
- [ ] 连续 7 天无数据丢失、重复对象、静默永久记忆或外部写入。
- [ ] 可查看 LLM 错误率、延迟、费用和关键行为指标。
- [ ] 记录 Capture 留存、纠错率、Now 接受率、Later 后行为、Memory 引用帮助率与不可信行为次数。

在 `EX-005` 完成前，不新增精确 Planner；在 `EX-012` 完成前，不把 EventKit 同步接入生产路径；
在 `EX-014` 完成前，不扩展可见 Cognitive Map 能力。

---

## 12. 完成定义（每个任务通用 DoD）

- [ ] 实现与 `01` 字段一致  
- [ ] 不违反 `00` 硬边界  
- [ ] 关联 Acceptance 有测试或手动清单  
- [ ] ActionLog 对 Agent 写路径有记录（若适用）  
- [ ] 无密钥进库/进客户端二进制  

---

## Final Principle

工程成功不是「服务都起了」，而是：

> 每天愿意打开 App，输入一句话，看到正确的对象与今日安排，并信任 Memory 不会在未确认时改写自我认知。

先垂直切片，再加日历与记忆；永远 Data Model → Agent → UI。
