# 00. MVP Decisions（架构与产品决策冻结）

Version: 1.0  
Status: **Frozen for V1**  
Last Updated: 2026-07-18

---

## 0. 文档地位

本文件是 **V1 / MVP 的最终裁决书（Decision Freeze）**。

设计文档体系（愿景、Agent、Memory、Planning、UX 等）描述的是产品演进过程；  
**当它们与本文件冲突时，以本文件为准。**

用途：

- 防止实现时在旧文档之间摇摆
- 给工程与 AI coding agent 提供单一决策真源
- 明确 In Scope / Out of Scope / Deferred

非目标：

- 不替代完整设计文档
- 不展开实现细节（接口字段、表结构细节见 Object Model / 后续 Engineering Breakdown）

---

## 1. Information Architecture

### Decision

V1 导航：

```text
App
├── Today
├── Thoughts
├── Projects
├── Memory
├── Activity
└── Capture
```

### Rationale

- Horizon 依赖足够的项目历史、Memory、Goal 数据；MVP 数据不足，做出来会空。
- Today 是日常 80% 入口；Thoughts / Memory 保证产品不退化成 Todo。

### Deferred

- **Horizon** → Phase 2
- 愿景文档中的 `Home / Horizon / Needs You` 布局不作为 V1 IA

### Today 结构（V1）

```text
Today
├── Now          （永远只突出 1 件事）
├── Timeline     （Fixed / Flexible / AI Suggested）
└── Risks        （需要关注的真实承诺风险）
```

### Work / 要做的事智能分组（V1）

- Commitment 仍是唯一工作真相源；工作脉络只是可重建的展示投影。
- 用户不创建、命名或维护 Category / 标签；AI 可结合既有 Project、事项语义与同项目 active Memory 自动整理。
- 页面通常显示 3–5 条、最多 6 条单层工作脉络；每个 Commitment 同时只出现一次。
- 每组默认展示 3 件，`risk`、已开始和最近截止事项必须优先露出。
- AI 不可用时保留旧投影；无旧结果时按既有 Project + 待归类降级。
- 分类不得创建 Project / Concept / Memory，不得改变 Today、优先级、Deadline 或 Commitment 状态。

---

## 2. MVP Loop & Execute 语义

### Decision

V1 闭环：

```text
Capture
  → Understand
  → Structure
  → Plan
  → User Action
  → Feedback
  → Learning
```

**Execute ≠ AI 外部执行。**

V1 Execute = 用户执行状态追踪：

- 开始任务（Start）
- 稍后（Snooze / Later）
- 完成（Complete）
- AI 记录状态变化与反馈

### Explicitly Not V1

```text
Plan → AI Executes externally
```

禁止：

- 自动发邮件
- 自动发消息
- 自动外部通信
- 自动付款或其他高风险外部动作

### Autonomy Levels（V1）

| Level | 名称 | V1 |
|-------|------|-----|
| 0 | Observer | ✅ |
| 1 | Assistant（建议） | ✅ |
| 2 | Manager（自动安排 AI Slot） | ✅ |
| 3 | Operator（外部执行） | ❌ |
| 4 | Advisor（主动发现问题） | ❌ / Phase 2+ |

默认：Balanced（对应 Level 1–2 组合）。

---

## 3. Thought Types

### Decision

V1 Thought 类型仅 5 种：

```text
Idea
Insight
Observation
Research
Decision Candidate
```

### Explicitly Not V1 Thought Types

- **Principle** — 属于 Memory 层产物，不是用户直接创建的 Thought
- **Note** — 避免退化为笔记应用
- **Question** — 可映射到 Observation / Research，V1 不单独建类型

### Full taxonomy（设计文档）

完整 7+ 种类型保留在长期设计中，**仅作扩展预留，不进 V1 产品表面**。

---

## 4. Memory Types

### Decision

V1 Memory 统一为 4 类：

```text
Preference
Project Context
Principle
Decision
```

| 类型 | 含义 | 示例 |
|------|------|------|
| Preference | 用户偏好 | 喜欢简洁设计 |
| Project Context | 项目背景 | Nimbus 定位：native / privacy |
| Decision | 历史决策及原因 | 为什么不做 Windows |
| Principle | 长期原则 | AI should assist, not dominate |

### Explicitly Not V1 Memory Types

- **Identity** — 属于 User Model，不是 Memory 对象
- 完整 Observation 层可对用户不可见；仅作为形成 Candidate 的内部中间态

### Naming Freeze

废弃以下作为 V1 对外命名的混用：

- 仅 `Preference / Project Context / Decision` 三桶（缺 Principle）
- `Identity / Preference / Principle / Observation` 四桶（Identity 错位）

以本文件四类为准。

---

## 5. Memory Write Rules

### Decision

区分两类记忆：

#### A. Long-term Memory（永久记忆）

**必须用户确认。**

```text
Observation / Extract
        ↓
Memory Candidate
        ↓
User Confirm
        ↓
Active Memory
```

规则：

- 不得把临时状态自动写成永久偏好
- 不得静默创建 Principle / Decision
- 用户可：确认 / 编辑 / 丢弃
- 每条 Active Memory 应可解释：content、type、source、confidence、evidence

#### B. Short-term Context（短期上下文）

**可以自动。**

例如：

- 当前活跃项目
- 今日计划快照
- 会话/当日工作状态

不进入 Memory UI 的长期库，不要求确认。

### Supersede / Decay

V1：支持基础更新与用户删除即可。  
完整冲突检测、取代、衰减算法 → Phase 2。

---

## 6. Project

### Decision

Project = **Context Container**，不是项目管理工具。

```text
Project
├── Thoughts
├── Decisions
├── Commitments
└── Memories
```

### V1 能力

- 轻量创建 / 命名 / 关联
- 输入自动关联到可能的 Project
- 展示项目相关 Thoughts / Commitments / Memory

### 内容如何识别并关联 Project（V1 规则）

**只匹配已有 Project，绝不静默自动建项目。**

| 方式 | 说明 |
|------|------|
| 名称命中 | 正文包含 `Project.name`（大小写不敏感） |
| 别名命中 | `aliases`（JSON 数组或逗号分隔）出现在正文 |
| 显式 project_name | 模型/抽取给出的名字，精确或别名匹配 |
| 弱描述 | 描述关键词 ≥2 命中才弱匹配（阈值默认不用，阈值≥70） |

**新建：**

1. 用户在 Projects 页手动创建（名称 + 可选描述/别名）  
2. 或 Capture 后若系统 **建议** 新名（如 `NovaMail`），用户点「创建项目」  
3. 创建后可「回溯关联」历史未归类内容  

**不会：** 仅因提到 Mac/iPhone/AI 就新建 Project。

### Explicitly Not V1

- Kanban / Board
- Sprint
- Progress Board
- 多人协作
- 完整项目管理工作流

---

## 7. Recurring / 循环任务

### Decision

**V1 不做 Recurring。**

仅支持**单次 Commitment**。

### Deferred to Phase 2

- Recurrence Rule
- 周期实例生成
- Cover / Accumulate / Recover
- 事件触发型循环

### Note

Agent Evaluation 用例中的「每周报告」类 Case **不作为 V1 验收项**。

---

## 8. Calendar Integration

### Decision

**Read-first；Write optional。**

| 能力 | V1 默认 |
|------|---------|
| 读取已有事件 / 空闲时间 | ✅ 默认开启（授权后） |
| 生成 AI Slot 建议 | ✅ |
| 写入 AI 工作块到系统日历 | ⚪ **用户开关，默认关闭** |

### Rationale

写入系统日历是高信任动作，不应在冷启动默认发生。

### Providers（目标）

- Apple Calendar
- Google Calendar

实现优先级可按平台分阶段，但产品规则相同：先读后写、写可选。

---

## 9. Runtime Topology：Cloud Agent first

### Decision

V1：

```text
Client (macOS)
    ↓
Encrypted API
    ↓
Agent Runtime (Cloud)
    ↓
LLM Provider
```

- 数据传输加密
- Local First / 本地模型处理敏感层 = **架构方向，不阻塞 MVP**

### Future（非 V1 阻塞）

```text
Sensitive Layer → Local Model
Complex Reasoning → Cloud Model
```

### Constraint

架构不得绑死单一部署形态；Agent Runtime 与 Client 通过明确 API 边界交互。

---

## 10. AI / Model Provider

### Decision

- **必须有** `LLMProvider` 抽象接口
- V1 **只实现一个**具体提供商：`DeepSeekProvider`（或当前选定的单一主模型）
- 另需 Embedding 能力（Memory 检索）
- 不在 V1 同时接入 OpenAI / Claude / Local 全套

### Future providers（接口预留）

```text
OpenAIProvider
ClaudeProvider
LocalProvider
```

### Constraint

产品智能层属于本产品；模型可替换。禁止把业务规则硬编码进某一厂商 SDK 调用细节。

---

## 11. Domain Objects（V1 一等公民）

### Must

```text
User
Project
Thought
Commitment
Memory
Decision
Event
ActionLog
RawInput（或等价原始输入记录）
```

### Not primary objects

```text
Task
Note
Reminder
Calendar Event   ← 可作为 Event 投影 / 外部同步，不作为核心领域主模型
```

### Time Model（V1 必须区分）

| 类型 | 含义 | AI 可否移动 |
|------|------|-------------|
| Fixed Time | 硬约束（会议等） | 否 |
| Deadline | 真实承诺截止 | 否（只能围绕它排） |
| Flexible Window | 执行窗口 | 窗口内可调 |
| AI Slot | 当前建议时间 | 可自动调整 |

规则：**错过 AI Slot ≠ 延期**；错过真实 Deadline / 承诺才进入 Risk。

### Relative day: 明天 / 后天（Early morning）

**Rule (frozen):** 用户本地时区 **00:00–05:00（不含 05:00）** 说出「明天 / 后天」（或 tomorrow / day after tomorrow）时：

- **不得**自动选定日期
- 必须弹出确认：
  - **明天** → `今天白天` vs `下一天（日历明天）`
  - **后天** → `明天白天` vs `后天（再下一天）`
- 确认前 Commitment 可创建，但 **不写** window/deadline（或清空由相对词推断的时间）
- 确认后写入对应 `window_start` / `window_end`，status → `planned`

05:00 及之后：正常解析（明天 = 下一日历日，后天 = 再下一日）。

### Commitment Status（V1）

```text
Captured
Planned
Scheduled
Completed
Cancelled
Risk
```

---

## 12. Client Scope

### Decision

- **macOS First**（SwiftUI）
- Menu Bar / 全局快捷键：Capture + Now/Next 轻量入口优先
- iPhone：非 V1 阻断项；若做则仅 Capture / Review 级

### Input

- 文本：V1 必须
- 语音：V1 目标能力；若 ASR/隐私阻塞，可标为 V1.1，但入口设计应预留

### UI 回执形态

- 禁止长聊天式主交互
- 使用 **Action Card**：理解结果 / 创建对象 / 安排 / Memory 候选 / 可修改

---

## 13. Explicit Out of Scope（V1 硬边界）

```text
❌ 完整笔记系统 / Notion 化
❌ Kanban / Sprint / 项目管理 UI
❌ 文件管理 / 云盘
❌ 邮件自动处理
❌ 自动发送消息 / 外部通信
❌ 企业协作 / 多人项目
❌ 完整知识库 / Graph DB 强依赖
❌ 复杂 Workflow / Agent 市场 / 插件生态
❌ Recurring 完整体系
❌ Horizon 视图
❌ Autonomy Level 3+ 外部执行
❌ 多模型全接入
❌ Identity 作为 Memory 类型
```

---

## 14. Success Metrics（操作定义待工程细化，产品方向冻结）

| Metric | 含义 |
|--------|------|
| Daily Capture Rate | 用户是否每天愿意输入 |
| AI Acceptance Rate | AI 安排被接受的比例（Start/完成 vs 改期/拒绝） |
| Memory Value | 用户是否感到「越来越懂我」 |
| Retention | 7 / 30 / 90 日 |

目标用户（首批）：Founder / Indie Hacker / Developer / Product Leader。

---

## 15. Document Governance

### Decision priority when conflicting

```text
00-MVP-Decisions.md          ← 本文件（最高，V1）
        ↓
01-MVP-Object-Schema.md
        ↓
02-MVP-Acceptance-Scenarios.md
        ↓
03-Engineering-Task-Breakdown.md  （实现顺序；不得扩 scope）
        ↓
AGENTS.md
        ↓
15 MVP Feature Spec / Core Intelligence（产品与智能意图）
        ↓
Object Model / Agent Architecture / Runtime（结构）
        ↓
UX / Technical Blueprint / 其他演进文档
        ↓
Engineering convenience
```

### 后续文档整理（管理项，非功能决策）

建议未来重编号（不阻塞开发）：

```text
00-MVP-Decisions.md
00-AGENTS.md（或仓库根 AGENTS.md）
01-Product-Vision.md
02-Agent-Architecture.md
03-Object-Model.md
04-UX-Design.md
05-MVP-Roadmap.md
06-Core-Intelligence.md
07-Agent-Runtime.md
08-MVP-Feature-Spec.md
09-Technical-Blueprint.md
10-Security.md
11-Competitive.md
12-Growth.md
…
```

当前仓库可保留历史文件名；**以本冻结文件裁决语义冲突**。

### Schema 冻结

字段级契约见：

- `docs/01-MVP-Object-Schema.md`

### Schema / Acceptance / Engineering / Memory / LLM

- `docs/01-MVP-Object-Schema.md`
- `docs/02-MVP-Acceptance-Scenarios.md`
- `docs/03-Engineering-Task-Breakdown.md`
- `docs/04-Memory-Cognitive-Map-Foundation.md` — Memory + Concept 基础（Cognitive Map 瘦身落地）
- `docs/05-LLM-Routing-Effect-First.md` — **体验优先**：有 Key 则模型做理解；本地门禁+回退；不以长文为调用门槛
- `docs/Cognitive_Map_Architecture_Upgrade_Specification.md` — 愿景；实现以 04 为准

### 仍可选补强（不阻塞开工）

1. 冷启动 & onboarding 完整文案（场景层已有 S20/S37/S38）
2. OpenAPI 正式稿（随 Phase 0 API 产出）

---

## 16. Decision Log（摘要）

| # | 议题 | 裁决 |
|---|------|------|
| 1 | 信息架构 | Today + Thoughts + Projects + Memory + Activity + Capture；Horizon 延后 |
| 2 | Execute | 用户开始/稍后/完成；无外部 AI 执行 |
| 3 | Thought 类型 | 5 种；Principle 不做 Thought |
| 4 | Memory 类型 | Preference / Project Context / Principle / Decision |
| 5 | Memory 写入 | 长期确认；短期 Context 可自动 |
| 6 | Project | 上下文容器；非项目管理 |
| 7 | Recurring | Phase 2 |
| 8 | Calendar | 默认读；写可选默认关 |
| 9 | 部署 | V1 云端 Agent + 加密 API；Local First 为方向 |
| 10 | 模型 | Provider 抽象 + 单一实现 + Embedding |
| 11 | 文档 | 本文件为 V1 冲突最高裁决 |

---

## Final Principle

V1 成功标准不是功能数量，而是：

> 用户愿意只通过自然语言输入，让系统整理思想与承诺、安排今天，并在确认后开始形成可信的个人记忆。

Build a Personal AI Operating System — not another productivity app.
