# 15. MVP Feature Specification（第一版产品功能规格）
# 15. MVP Feature Specification（第一版产品功能规格）

Version: 1.0

---

# 1. MVP 目标

## 核心验证

第一版不是验证：

> AI 能不能做一个完整个人操作系统。

而是验证：

> 用户是否愿意放弃手动管理任务系统，只通过自然语言输入，让 AI 帮自己整理和推进工作。


---

# 2. MVP 核心闭环

V1 只需要完成：

```text
Capture

↓

Understand

↓

Structure

↓

Plan

↓

Execute

↓

Learn
```

---

用户体验：

用户：

> 下周优化一下官网，同时研究一下 AI 邮件市场。


AI：

自动拆解：

```text
Thought:

AI Email Market Research


Commitment:

Optimize Homepage


Project:

Email Product
```

然后：

安排执行。


---

# 3. MVP 产品范围


## Included（必须做）


### 1. Universal Input

统一输入。


### 2. Thought Capture

想法捕获。


### 3. Commitment Management

工作承诺管理。


### 4. Basic Planning

自动安排。


### 5. Calendar Integration

连接日历。


### 6. Basic Memory

长期偏好和项目背景。


### 7. Agent Activity

AI行为透明。


---

## Not Included（暂不做）


❌ 邮件自动处理

❌ 自动发送消息

❌ 企业协作

❌ 完整知识库

❌ 多人项目管理

❌ 高级 Agent 自动执行

❌ 复杂 Workflow


---

# 4. 产品信息架构


MVP：

```text
App


├── Today

├── Thoughts

├── Projects

├── Memory

└── Capture

```

---

# 5. Feature 1：Universal Input

## 目标

用户永远只有一个入口。


---

## 用户故事

> 我不想判断这是什么类型，我只想告诉 AI。


---

## UI


首页底部：

```text
--------------------------------

有什么想法？

🎤


--------------------------------
```

---

## 支持输入


### Text


例如：

> 明天下午处理客户反馈。


---

### Voice


例如：

> 最近觉得产品方向有点乱，帮我整理一下。

---

# 6. Input Processing


流程：

```text
Input

↓

Transcription

↓

Intent Analysis

↓

Object Extraction

↓

Result Card
```

---

# 7. Feature 2：Thought System


## 目标

捕获用户思考。


---

## 不叫 Note。


因为：

Note 是保存。

Thought 是理解。


---

## 用户故事

> 我希望我的想法不会丢，而且以后 AI 能理解它们。


---

## Thought 类型


MVP：

只支持：

```text
Idea

Insight

Decision Candidate

Research

Observation
```

---

# 8. Thought UI


## List


时间流：

```text
Thoughts


Today


💡

AI邮件产品应该减少主动干扰


关联：

Email UX


状态：

Exploring

```

---

## Detail


显示：

```text
Original Thought


Evolution


Related Actions


Related Decisions
```

---

# 9. Feature 3：Commitment System


## 目标

替代传统 Task。


---

## 用户故事

> 我只表达我要完成什么，AI帮我管理。


---

## 数据


```text
Commitment

Title

Goal

Deadline

Duration

Project

Status
```

---

# 10. Commitment 状态


MVP：

```text
Captured

Planned

Scheduled

Completed

Cancelled

Risk
```

---

# 11. Feature 4：Today View


这是每天核心页面。


---

## 目标

回答：

> 今天应该关注什么？


---

结构：

```text
Today


NOW


当前重点事项


Timeline


今日安排


Risks


需要关注


```

---

# 12. Now Card


首页核心。


例如：

```text
NOW


准备App Store提交


35分钟


原因：

发布窗口接近


[开始]

[稍后]
```

---

# 13. Timeline


不是传统日历。


显示：

AI计划。


---

示例：

```text
09:30

团队会议

Fixed


11:00

整理反馈

Flexible


15:00

官网调整

Suggested

```

---

# 14. Feature 5：Planning Engine MVP


## 能力范围


支持：

### Deadline理解

例如：

> 周五完成。


---

### Calendar空闲检测


寻找：

可执行时间。


---

### 自动安排


生成：

AI Slot。


---

### 简单重排


处理：

- 任务完成
- 日历变化


---

# 15. Planning限制


MVP 不做：

- 复杂优化算法
- 多人协作
- 自动改变战略目标


---

# 16. Feature 6：Memory System MVP


## 目标

让 AI 开始了解用户。


---

## MVP Memory 类型


只支持：

---

## Preference


例如：

```text
喜欢：

自然英文表达
```

---

## Project Context


例如：

```text
Nimbus:

macOS native

Privacy focus
```

---

## Decision


例如：

```text
保持Mac-only

原因：

保护原生体验
```

---

# 17. Memory 创建流程


不是自动全部保存。


流程：

```text
Candidate

↓

Score

↓

User Confirm

↓

Active Memory
```

---

# 18. Memory UI


页面：

```text
Memory


About Me


Preferences


Projects


Principles

```

---

显示：

```text
你可能偏好：

简单产品设计


来源：

过去8次设计选择


[保存]

[删除]
```

---

# 19. Feature 7：Project Context


## 目标

让 AI 理解事情属于哪里。


---

例如：

Project：

```text
Nimbus


Goal:

Build native email client


Principles:

Privacy

Calm UX

```

---

作用：

所有输入自动关联。

---

# 20. Feature 8：Agent Activity


## 目标

建立信任。


---

显示：

```text
AI Activity


今天：

调整2个任务时间


原因：

会议延迟


新增：

1条Memory候选

```

---

# 21. AI Response Design


禁止：

长聊天回复。


采用：

Action Card。


---

格式：

```text
理解完成


创建：

官网优化任务


安排：

周三14:30


发现：

可能形成产品原则


[查看]

[修改]

```

---

# 22. MVP Agent 能力要求


## Intent Agent

必须：

识别：

- Thought
- Commitment
- Decision


---

## Memory Agent


必须：

生成候选。


---

## Planning Agent


必须：

简单安排。


---

## Autonomy Agent


MVP：

只支持：

Level 0-2。


---

# 23. MVP Autonomy Level


实现：


## Level 0

观察。


---

## Level 1

建议。


---

## Level 2

自动安排。


---

暂不：

Level 3 自动执行外部操作。


---

# 24. MVP 数据模型


必须：

```text
User

Project

Thought

Commitment

Memory

Decision

Event

ActionLog
```

---

# 25. MVP 技术依赖


## Client


macOS：

SwiftUI。


---

## Backend


需要：

- Auth
- Agent Runtime
- Sync API


---

## Storage


PostgreSQL：

结构数据。


Vector：

Memory搜索。


---

# 26. MVP AI 调用需求


DeepSeek 4 可以承担：

✅ Intent

✅ Extraction

✅ Classification

✅ Basic Planning

✅ Memory Candidate


---

需要额外：

Embedding Model。


---

暂不需要：

复杂多模型系统。

---

# 27. MVP 成功标准


不是：

功能数量。


---

## Metric 1

Daily Capture Rate


用户每天是否输入。


---

## Metric 2

AI Acceptance Rate


AI安排是否被接受。


---

## Metric 3

Memory Value


用户是否觉得：

AI越来越懂自己。


---

## Metric 4

Retention


7/30/90日。


---

# 28. MVP 用户测试方案


## 目标用户

20-50人。


优先：

- Founder
- Developer
- Product Manager


---

## 测试周期

30天。


---

观察：

### 第1周

是否愿意输入。


### 第2周

是否接受自动安排。


### 第4周

是否感受到 Memory 价值。


---

# 29. MVP 最大风险


## Risk 1

用户觉得：

“只是AI Todo”。


解决：

Thought + Memory。


---

## Risk 2

AI安排不准。


解决：

低权限 + 可撤销。


---

## Risk 3

冷启动无价值。


解决：

从第一句话建立 Context。


---

# 30. MVP 最终定义


V1 不是：

一个完整 AI OS。


而是：

> 一个可以捕获你的想法、理解你的工作、自动整理今天计划，并开始形成个人记忆的 AI Agent。


---

# 下一阶段：

## 16. Engineering Task Breakdown（工程任务拆解）

已产出（以冻结栈为准）：

→ **`docs/03-Engineering-Task-Breakdown.md`**

含 Phase 0/1 任务 ID、依赖、Acceptance 映射与首个 Sprint 清单。