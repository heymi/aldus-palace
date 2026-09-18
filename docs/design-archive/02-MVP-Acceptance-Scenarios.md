# 02. MVP Acceptance Scenarios（关键场景与验收标准）

Version: 1.0  
Status: **Frozen for V1**  
Parents: `docs/00-MVP-Decisions.md`, `docs/01-MVP-Object-Schema.md`  
Last Updated: 2026-07-18

---

## 0. 文档地位

本文件定义 V1 **可测试的行为契约**。

用途：

- 产品验收（QA / 用户测试观察点）
- Agent 回归评测（输入 → 对象 / 状态断言）
- 实现时防止「能跑但语义错」

优先级：

```text
00-MVP-Decisions     范围与规则
01-MVP-Object-Schema 对象与字段
02-MVP-Acceptance    本文件：行为断言
```

冲突时：00 > 01 > 02（02 不得扩大范围）。

### 写法约定

每个场景：

| 字段 | 含义 |
|------|------|
| **ID** | 稳定编号，测试用例引用 |
| **Priority** | P0 阻断发布 / P1 应有 / P2 增强 |
| **Given** | 前置状态 |
| **When** | 用户或系统动作 |
| **Then** | 必须满足的断言 |
| **Not** | 明确禁止出现的错误行为 |

对象字段名以 `01-MVP-Object-Schema` 为准（snake_case type 枚举）。

---

## 1. 验收分层

| Layer | 测什么 | 典型手段 |
|-------|--------|----------|
| L1 Capture | 输入是否落库、不丢 | API / DB |
| L2 Understand | 对象拆分是否正确 | Agent fixture 评测 |
| L3 Structure | 字段/状态是否合法 | Schema + 单元测试 |
| L4 Plan | AI Slot / Timeline 是否合理 | 规则 + 样例 |
| L5 Act | 用户开始/稍后/完成 | UI / API |
| L6 Memory | 候选与确认门禁 | 端到端 |
| L7 Trust | Activity 可解释、无越权 | UI + ActionLog |

V1 **不测**：外部自动执行、Recurring、Horizon、Identity Memory、复杂冲突解决 UI（可有最小提示）。

---

## 2. Capture & RawInput

### S01 — 文本输入先存后理解 · P0

**Given** 已登录用户  

**When** 在 Capture 输入：  
> 下周优化一下官网  

并提交  

**Then**

1. 创建 `RawInput`：`source=text`，`content` 含原文，`processing_status` 最终为 `processed`（或短暂 `pending` 后变为 processed）
2. 产生至少一条下游对象，且带 `source_input_id` 指向该 RawInput
3. UI 以 **Action Card** 回执，而非长聊天泡

**Not**

- 未保存 RawInput 就直接只显示模型回复
- 要求用户先选「任务 / 笔记 / 事件」类型

---

### S02 — 不要求用户分类 · P0

**Given** 首页 / Capture  

**When** 查看主输入 UI  

**Then**

- 主路径只有统一输入（文本；语音若启用则同一入口）
- 无「新建 Task / Note / Event」作为主创建路径

**Not**

- 把类型选择作为创建前必填步骤

---

### S02A — AI 自动整理工作脉络，不要求用户维护分类 · P1

**Given** 存在 15–40 条开放 Commitment，其中某一 Project 有多个工作主题

**When** 打开「要做的事」

**Then**

1. 页面通常显示 3–5 条、最多 6 条单层工作脉络
2. 每件 Commitment 只出现一次
3. 每组默认展示 3 件；`risk`、已开始和最近截止事项优先露出
4. 用户无需创建、命名、拖拽维护分类
5. AI 失败时仍返回完整列表：旧投影 → Project → 待归类
6. 用户通过事项菜单调整到已有分组后，后续重建不得覆盖

**Not**

- 自动创建 Project / Concept / 永久 Memory
- 分类改变 Today、优先级、Deadline、Risk 或完成状态
- 在 `GET /commitments` 中同步调用模型

---

### S03 — 处理失败可感知 · P1

**Given** Agent / LLM 不可用  

**When** 用户提交输入  

**Then**

1. `RawInput` 仍保存，`processing_status=failed`，可有 `error_message`
2. 用户看到可重试的错误态
3. 原文不丢失

**Not**

- 静默丢弃输入
- 伪造成功创建 Commitment

---

## 3. Understand & Object Extraction

### S04 — 纯思想 → 仅 Thought · P0

**Given** 无特殊前置  

**When** 输入：  
> 最近觉得 AI 产品都太吵了，干扰太多  

**Then**

1. 创建 `Thought`，`type` ∈ {`observation`,`insight`,`idea`}
2. `status=captured`（或 `exploring`）
3. **不**创建 `Commitment`（无明确行动承诺）

**Not**

- 自动创建「简化产品」类 Commitment
- Thought.type = `principle` 或 `note`

---

### S05b — 凌晨「明天/后天」必须确认 · P0

**Given** 用户时区本地时间为 **00:00–05:00（不含 05:00）**  

**When** 输入含「明天」或「后天」（或英文等价）  

**Then**

1. 可创建 Commitment，但 **不得** 自动写入最终 window/deadline（由相对词推断的部分）
2. 返回 clarification，选项：
   - 明天 → `今天白天` / `下一天（日历明天）`
   - 后天 → `明天白天` / `后天`
3. 用户选择后才写入 `window_*`，status → `planned`
4. ActionLog 含 clarification_requested / clarification_resolved

**Not**

- 凌晨静默当成日历明天/后天

---

### S05c — 非凌晨「明天」自动解析 · P1

**Given** 本地时间 ≥ 05:00  

**When** 输入「明天优化…」  

**Then** Commitment 带下一日历日的 window（或等价），无需确认  

---

### S05 — 明确行动 → Commitment · P0

**Given** 用户时区已设置  

**When** 输入：  
> 周五前改完官网首页文案  

**Then**

1. 创建 `Commitment`：`title` 可执行，`deadline` 落在合理「本周五」解释（按时区）
2. `status` ∈ {`captured`,`planned`}
3. 可无 `ai_slot_*`（尚未 Plan 也可）

**Not**

- 仅创建 Note/Thought 而无 Commitment
- 把「周五」写成不可解析的纯文本字段且无 deadline

---

### S06 — 混合输入 → Thought + Commitment · P0

**Given** 存在 Project `Nimbus`（或允许 AI 新建/挂起关联）  

**When** 输入：  
> 想做 iOS 版，下个月研究一下可行性  

**Then**

1. ≥1 `Thought`（idea / research 等）
2. ≥1 `Commitment`（研究可行性；window 或 deadline 落在「下个月」语义内）
3. Action Card 同时展示两者
4. 二者 `source_input_id` 相同

**Not**

- 只生成 Task 标题、丢掉思想部分
- 生成 Recurring / 多个无关联垃圾对象

---

### S07 — 研究意图 · P1

**When** 输入：  
> 研究一下 AI 邮件市场  

**Then**

1. `Thought.type=research` **或** Commitment 标题表达 research，二者至少其一语义正确
2. 若同时有 Thought + Commitment，允许
3. 无外部「自动打开浏览器研究」动作

---

### S08 — 决策候选 · P1

**When** 输入：  
> 我觉得 Nimbus 应该保持 Mac only，不要做 Windows  

**Then**

1. 优先：`Thought.type=decision_candidate` 和/或 `Decision` 草稿
2. 可生成 `Memory` **candidate**（type=`decision` 或 `principle`），`status=candidate`
3. 不得直接 `Memory.status=active`

**Not**

- 静默写入永久「永不做 Windows」且用户未确认

---

### S09 — 不确定时偏 Thought · P0

**When** 输入：  
> 产品方向有点乱  

**Then**

1. 创建 Thought（observation/idea）
2. 不强制 Commitment
3. 可建议用户补充，但不阻塞保存

**Not**

- 强行拆成多个无依据任务

---

### S10 — 禁止 Principle 作为 Thought type · P0

**When** 任意输入导致抽取  

**Then**  
所有 `Thought.type` ∈  

```text
idea | insight | observation | research | decision_candidate
```

**Not**  
`principle` / `note` / `question` / `identity`

---

## 4. Project Context Container

### S11 — 关联已有 Project · P1

**Given** Project `name=Nimbus`, `status=active`  

**When** 输入：  
> Nimbus 官网下周调整定位  

**Then**

1. 相关 Thought/Commitment 的 `project_id` = Nimbus
2. Project 列表能看到关联对象

**Not**

- 创建 Kanban / sprint / progress board

---

### S12 — Project 非项目管理 · P0（产品态）

**When** 打开 Projects  

**Then**

- 可见：名称、描述、关联 Thoughts/Commitments/Memory
- 不可见：Board、Sprint、故事点、完整 PM 工作流

---

## 5. Planning & Today

### S13 — 结合日历空闲生成 AI Slot · P0

**Given**

- 日历已授权只读
- 今日 10:00–11:00 有 `Event.kind=fixed_external`
- 存在 Commitment：`duration_minutes=60`，`status=planned`，无 deadline 冲突

**When** 触发今日规划（进入 Today / 显式「生成本日计划」）  

**Then**

1. 该 Commitment 获得 `ai_slot_start/end`，且 **不与** 10:00–11:00 重叠
2. `status` 变为 `scheduled`（若已安排 slot）
3. Timeline 同时显示 Fixed 会议与 Suggested/Flexible 工作块
4. 写入 `ActionLog`：`ai_slot_assigned` 或 `plan_generated`，含 reason

**Not**

- 默认把工作块写入系统日历（`calendar_write_enabled=false` 时）
- 移动或删除外部 fixed 会议

---

### S14 — 日历写入默认关闭 · P0

**Given** `User.calendar_write_enabled=false`  

**When** AI 安排 AI Slot  

**Then**

1. App 内 Timeline 可见建议
2. **不** 创建外部日历上的 `ai_work_block`（或 `Event` 仅 app 内且未 sync 外部）
3. 不报「已写入 Google/Apple 日历」成功态

---

### S15 — 用户开启写入后可选推送 · P1

**Given** `calendar_write_enabled=true`，日历写权限已授  

**When** AI 安排某 Commitment 的 AI Slot 且产品路径包含写入  

**Then**

1. 可创建 `Event.kind=ai_work_block`，`commitment_id` 关联
2. `Commitment.scheduled_event_id` 可回填
3. ActionLog 记录日历相关动作

**Not**

- 在用户未开启时写入

---

### S16 — Now 只突出一件事 · P0

**Given** 今日有 ≥3 个 scheduled/planned Commitments  

**When** 打开 Today  

**Then**

1. Now 区域 **仅 1** 个主 Commitment
2. 其余在 Timeline / 列表，不并列 10 个同等 Now

---

### S17 — 错过 AI Slot ≠ Risk · P0

**Given**

- Commitment `status=scheduled`
- `ai_slot_end` 已过
- `deadline` 为空，或 deadline 仍在未来

**When** 用户打开 Today 或系统刷新状态  

**Then**

1. **不得** 仅因错过 AI Slot 将 `status` 设为 `risk`
2. 允许重排：新的 `ai_slot_*`，ActionLog `ai_slot_adjusted`
3. UI 不展示「已逾期」若仅错过建议时间

**Not**

- Delay / Overdue / Expired 作为主状态语义

---

### S18 — 真实 Deadline 风险 · P0

**Given**

- Commitment `deadline` 已过或进入危险窗口（实现可定义，如 24h 内）
- `status` ∉ {`completed`,`cancelled`}

**When** 刷新 Today  

**Then**

1. 出现在 Risks，或 `status=risk`
2. 与「仅错过 AI Slot」行为可区分

---

### S19 — 会议变化触发重排 · P1

**Given**

- Commitment 原 AI Slot 14:00–15:00
- 新同步到 14:00–15:30 的 fixed 会议

**When** 日历同步完成  

**Then**

1. AI Slot 调整到不冲突时间，或标为需关注
2. ActionLog 说明原因（会议冲突）
3. 不删除 Commitment

---

### S20 — 无日历降级 · P0

**Given** 用户未连接日历  

**When** 创建带 window/deadline 的 Commitment 并查看 Today  

**Then**

1. 仍可 Capture / 建对象 / 列表查看
2. Planning 可给出粗粒度建议（按 window/deadline/duration），或明确提示「连接日历后可避开会议」
3. 产品仍可用，不白屏

**Not**

- 强制绑定日历才能输入

---

## 6. User Execute（非 AI 外部执行）

### S21 — 开始 · P0

**Given** Commitment `status=scheduled`  

**When** 用户在 Now 点「开始」  

**Then**

1. `started_at` 有值
2. ActionLog `user_started`
3. 无外部消息/邮件发送

---

### S22 — 稍后 · P0

**Given** Now 展示 Commitment A  

**When** 用户点「稍后」  

**Then**

1. Now 可换另一候选，或 A 的 AI Slot 延后
2. A 不因此变 `risk`（除非另有 deadline 规则）
3. ActionLog `user_snoozed`

---

### S23 — 完成 · P0

**Given** Commitment 进行中或 scheduled  

**When** 用户点「完成」  

**Then**

1. `status=completed`，`completed_at` 有值
2. 释放的时间可用于提示重排（P1）
3. ActionLog `user_completed`

---

### S24 — 禁止外部自动执行 · P0

**When** 用户输入含「帮我发邮件告诉客户延期」类意图  

**Then**

1. 可作为 Thought / Commitment「起草/准备回复」记录
2. **不得** 实际发送邮件或调用外部通信成功完成
3. 若识别为高风险，保持建议级，不进入 Operator 行为

---

## 7. Memory

### S25 — 明确偏好 → Candidate · P0

**When** 输入：  
> 我不喜欢复杂的软件，界面要简单  

**Then**

1. `Memory`：`type=preference`，`status=candidate`，`source` ∈ {`user_explicit`,`ai_inferred`}
2. 有可解释 `content`；`evidence` 鼓励有值
3. Memory UI 可见待确认

**Not**

- 直接 `active` 且影响后续行为却无确认

---

### S26 — 原则候选 · P0

**When** 输入：  
> 以后产品不要做太复杂。AI 应该辅助而不是主导  

**Then**

1. 可创建 `Memory` candidate：`type=principle`（和/或 preference）
2. **不** 创建 `Thought.type=principle`
3. 用户确认前不进入 active

---

### S27 — 用户确认 Memory · P0

**Given** Memory `status=candidate`  

**When** 用户点「保存/确认」  

**Then**

1. `status=active`，`confirmed_at` 有值
2. ActionLog `memory_confirmed`
3. 后续相关规划/文案可使用该 Memory（召回）

---

### S28 — 用户丢弃 Memory · P0

**Given** Memory `status=candidate`  

**When** 用户点「删除/丢弃」  

**Then**

1. `status=archived` 或记录删除
2. ActionLog `memory_rejected`
3. 不得再当 active 召回

---

### S29 — 项目背景 Memory · P1

**Given** Project Nimbus  

**When** 输入：  
> Nimbus 的定位是 macOS native、隐私优先  

**Then**

1. Memory candidate：`type=project_context`，`project_id` 指向 Nimbus
2. 确认后，与 Nimbus 相关输入的 Context 可召回该条

---

### S30 — 临时状态不进长期 Memory · P0

**When** 输入：  
> 我现在有点累，下午不想开会  

**Then**

1. 可作为 Thought 或 short-term context
2. **不得** 自动 active 为长期 Preference「永远不下午开会」
3. 若生成 candidate，须低置信且待确认；更优：不生成长期 Memory

---

### S31 — Memory 仅四类 · P0

**Then** 所有持久 `Memory.type` ∈  

```text
preference | project_context | principle | decision
```

**Not**  
`identity` / `relationship` / `observation` 作为 Memory 表 type

---

### S32 — 决策与 Memory 提升 · P1

**Given** 用户确认决策「Keep Mac only」  

**When** 系统提议记住该决策  

**Then**

1. 存在 `Decision` 记录（title/reason）
2. Memory candidate `type=decision`（或 principle），待确认
3. 确认前 Decision 可存在，但长期召回以 active Memory 为准（实现可文档化）

---

## 8. Activity & Trust

### S33 — Agent 调整可解释 · P0

**Given** AI 因会议延期调整了 2 个 AI Slot  

**When** 用户打开 Activity  

**Then**

1. 可见今日 Agent 动作摘要（数量 + 原因）
2. 对应 ActionLog 存在 `reason`

**Not**

- 静默大改计划且无可追溯记录

---

### S34 — Action Card 可修改理解 · P1

**Given** 抽取结果有误（如误建 Commitment）  

**When** 用户在 Card 上修改/取消创建  

**Then**

1. 对象状态与用户意图一致（删除或 cancelled）
2. ActionLog `user_edited`
3. 不留下幽灵 scheduled 项

---

## 9. 信息架构与导航

### S35 — V1 导航完备 · P0

**When** 使用主窗口  

**Then** 可到达：

```text
Today | Thoughts | Projects | Memory | Activity | Capture
```

**Not**

- 以 Horizon 为 V1 主导航必备项
- 缺失 Today 或 Capture

---

### S36 — Thoughts 时间流 · P1

**Given** 今日有 Thought  

**When** 打开 Thoughts  

**Then**

- 按时间可见 content、type/状态、关联 project（若有）
- 文案/信息模型不叫「Notes」为主品牌

---

## 10. 冷启动（最小）

### S37 — 首条输入即有价值 · P0

**Given** 新用户，无 Project/Memory/日历  

**When** 完成第一次 Capture（含思想或行动）  

**Then**

1. 对象成功创建
2. Action Card 解释「我理解了什么」
3. 用户无需先配置 taxonomy / 文件夹

---

### S38 — 空 Today 不空洞到无引导 · P1

**Given** 无 Commitment  

**When** 打开 Today  

**Then**

- 引导去 Capture，而非空白死页
- 不强制先连日历

---

## 11. 明确不验收（Anti-Scope）

以下 **失败也不得为了让测试通过而实现**：

| ID | 描述 | 归属 |
|----|------|------|
| X01 | 输入「每周五写周报」自动建 RecurrenceRule | Phase 2 |
| X02 | 自动发邮件/消息/付款 | 禁止 |
| X03 | Kanban / Sprint | 禁止 |
| X04 | Horizon 完整长期视图 | Phase 2 |
| X05 | Identity 写入 Memory 表 | 禁止 |
| X06 | Graph DB / 完整知识库 | 禁止 |
| X07 | 未确认即将 Principle 当系统硬约束 | 禁止 |

原 Roadmap Case 4（循环任务）→ **V1 不测**。  
原 Case 3（策略冲突）：见 S39 最小版。

---

### S39 — 冲突感知（最小，P2）

**Given** active Memory/Decision：「不做移动端」  

**When** 输入：  
> 开始做 iOS 版  

**Then（V1 最小）**

1. 仍按 S06 可建 Thought + Commitment
2. **鼓励**：Action Card 提示与既有决策/记忆可能冲突（若召回成功）
3. **不要求** 完整冲突解决工作流或自动废止旧 Memory

**Not**

- 静默删除旧 Decision/Memory
- 因冲突拒绝保存新输入

---

## 12. Agent 评测夹具（建议格式）

便于自动化（伪 JSON）：

```json
{
  "id": "S06",
  "input": "想做 iOS 版，下个月研究一下可行性",
  "context": {
    "timezone": "Asia/Tokyo",
    "projects": [{ "name": "Nimbus" }]
  },
  "expect": {
    "thoughts_min": 1,
    "commitments_min": 1,
    "memory_active_max": 0,
    "thought_types_allowed": [
      "idea", "insight", "observation", "research", "decision_candidate"
    ],
    "forbidden": ["recurrence", "external_send", "thought_type:principle"]
  }
}
```

P0 场景建议全部进入 CI 的 Agent eval 集；LLM 非确定处允许：

- title 文案 paraphrasing
- importance 数值容差
- project_id 在「无同名项目」时为 null 或新建（二选一写死产品策略后固定）

### 产品策略钉死（评测用）

**PS1** 无匹配 Project 时：V1 允许 `project_id=null`，不强制自动建项目。  
**PS2** 语音转写错误：按转写文本理解；用户可编辑 Raw 文本重跑（P1）。  
**PS3** AI Acceptance Rate 分母：当日被展示过 AI Slot 的 Commitment 次数；分子：用户未在 24h 内 snooze/改期/取消安排的次数（实现可微调，但需文档化同一口径）。

---

## 13. 发布门槛（V1 Exit Criteria）

**必须全部 P0 通过**（人工或自动）：

```text
S01 S02 S04 S05 S06 S09 S10
S12 S13 S14 S16 S17 S18 S20
S21 S22 S23 S24
S25 S26 S27 S28 S30 S31 S33 S35 S37
```

P1 建议 ≥80% 通过再扩测用户。  
P2 不阻断。

---

## 14. 场景索引

| ID | 主题 | P |
|----|------|---|
| S01 | 先存 RawInput | P0 |
| S02 | 统一入口无分类 | P0 |
| S02A | AI 自动整理工作脉络 | P1 |
| S03 | 失败可重试 | P1 |
| S04 | 纯思想 | P0 |
| S05 | 明确行动 | P0 |
| S06 | 混合拆分 | P0 |
| S07 | 研究 | P1 |
| S08 | 决策候选 | P1 |
| S09 | 不确定偏 Thought | P0 |
| S10 | Thought 类型门禁 | P0 |
| S11 | Project 关联 | P1 |
| S12 | 非 PM UI | P0 |
| S13 | 空闲排程 | P0 |
| S14 | 日历写默认关 | P0 |
| S15 | 可选写入 | P1 |
| S16 | Now 单焦点 | P0 |
| S17 | 错过 Slot ≠ Risk | P0 |
| S18 | Deadline Risk | P0 |
| S19 | 会议重排 | P1 |
| S20 | 无日历降级 | P0 |
| S21–S23 | 开始/稍后/完成 | P0 |
| S24 | 禁外部执行 | P0 |
| S25–S28 | Memory 门禁 | P0 |
| S29 | Project Context | P1 |
| S30 | 临时≠长期 | P0 |
| S31 | Memory 四类 | P0 |
| S32 | Decision 提升 | P1 |
| S33 | Activity | P0 |
| S34 | 改理解 | P1 |
| S35–S36 | IA | P0/P1 |
| S37–S38 | 冷启动 | P0/P1 |
| S39 | 冲突最小 | P2 |
| X01–X07 | Anti-scope | — |

---

## Final Principle

验收的不是「模型是否聪明」，而是：

> 用户只输入自然语言时，系统是否用对的对象、对的时间语义、对的记忆门禁，完成 Capture → Plan → User Action → Learning，且从不越权。
