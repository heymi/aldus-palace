# 12. Technical Implementation Blueprint（技术实现蓝图）
# 12. Technical Implementation Blueprint（技术实现蓝图）

Version: 1.0

---

# 1. 技术目标

构建一个：

- 多设备运行
- Local First
- AI Agent 驱动
- 长期 Memory
- 动态 Planning
- 高隐私

的个人 AI 系统。

---

# 2. 总体技术架构

## High Level Architecture

```text
                    Client Layer

        ┌──────────────────────────┐
        │                          │
        │ macOS App                │
        │ iOS App                  │
        │ Menu Bar                 │
        │ Widget                   │
        │                          │
        └────────────┬─────────────┘


                     │


              Sync / API Layer


                     │


        ┌────────────┴─────────────┐

        │     Agent Runtime        │

        └────────────┬─────────────┘


                     │


 ┌──────────┬──────────┬──────────┬──────────┐

Intent    Memory    Planning    Action

Agent     Agent     Agent       Agent


                     │


        ┌────────────┴─────────────┐

        │     Data Layer           │
        │                          │
        │ PostgreSQL               │
        │ Vector DB                │
        │ Graph Layer              │
        │ Object Storage           │
        │                          │
        └──────────────────────────┘

```

---

# 3. Client Architecture

## 3.1 macOS First

原因：

目标用户主要在：

- 工作
- 编程
- 产品设计
- 商业决策


核心场景发生在 Mac。


---

# macOS App


技术：

推荐：

## SwiftUI + Swift Concurrency


原因：

- 原生体验
- Apple Intelligence 接入
- 系统权限
- Menu Bar
- Widget


---

结构：

```text
Mac App

├── Main Window
│
├── Input System
│
├── Today View
│
├── Thought View
│
├── Memory View
│
└── Menu Bar Agent

```

---

# 3.2 iPhone App


定位：

不是完整工作台。


主要：

- Capture
- Review
- Quick Decision


---

页面：

```text
iPhone

├── Capture

├── Today

├── Thoughts

└── Memory

```

---

# 3.3 Menu Bar Agent


非常重要。


因为 Agent 不应该要求用户打开 App。


常驻：

```text
◉ AI


Now:

Prepare release


Next:

15:00 Meeting


Capture Idea
```

---

# 4. Backend Architecture


## 服务拆分


```text
Backend


├── API Gateway

├── Auth Service

├── User Service

├── Agent Runtime

├── Memory Service

├── Planning Service

├── Sync Service

├── Notification Service

└── Connector Service

```

---

# 5. Agent Runtime


核心。


负责：

调度不同 Agent。


---

输入：

```json
{
"user_input":

"下周优化官网"
}
```

---

Runtime：

执行：

```text
Input Agent

↓

Intent Agent

↓

Entity Agent

↓

Memory Retrieval

↓

Planning Agent

↓

Response Generator

```

---

# 6. Agent Communication Protocol


不要让 Agent 互相聊天。


采用：

Structured Message。


---

例如：

Intent Agent 输出：

```json
{
"type":

"Commitment",

"confidence":

0.86,

"entities":

[
"Nimbus"
],

"time":

"next week"
}

```

---

下一 Agent 读取。


---

# 7. LLM Layer


不要固定一个模型。


根据任务分配。


---

## Fast Model


负责：

- 分类
- 提取
- 简单判断


例如：

Intent。


---

## Reasoning Model


负责：

- 规划
- 决策
- 复杂分析


---

## Embedding Model


负责：

Memory 搜索。


---

# 8. Model Router


根据任务选择模型。


例如：

```text
输入：

"记住我喜欢简单设计"


↓

Fast Model

```

---

输入：

```text
分析三个项目优先级

↓

Reasoning Model

```

---

# 9. Local AI Layer


未来重要。


本地处理：

- Sensitive Detection
- Intent Classification
- Memory Index
- Personal Preference


---

架构：

```text
User Device


Local Model

↓

Private Context

↓

Cloud Reasoning (optional)

```

---

# 10. Data Storage Architecture


采用：

三层。


---

# Layer 1

## PostgreSQL


存：

结构化数据。


例如：

- User
- Project
- Commitment
- Memory Metadata


---

# Layer 2

## Vector Database


存：

Embedding。


用途：

语义搜索。


例如：

用户：

> 找之前关于邮件体验的想法。


---

# Layer 3

## Graph Layer


存：

关系。


例如：

```text
Thought

↓

Decision

↓

Project

↓

Goal

```

---

# 11. Sync Architecture


多设备同步。


推荐：

Event Sourcing。


---

不是：

直接同步当前状态。


而是：

记录变化。


---

例如：

```text
Event:


TaskMoved

14:00

→

16:00

```

---

优势：

- 可撤销
- 可恢复
- 可审计


---

# 12. Core Database Schema


## users


```sql
id
email
timezone
created_at
```


---

## projects


```sql
id
user_id
name
description
status
```

---

## thoughts


```sql
id
user_id
project_id

content

type

importance

maturity

embedding

created_at
```

---

## commitments


```sql
id

title

status

deadline

duration

priority_score

project_id

```

---

## memories


```sql
id

type

content

importance

confidence

embedding

status

```

---

## decisions


```sql
id

statement

reason

project_id

status

created_at

```

---

## events


```sql
id

source

type

start_time

end_time

metadata

```

---

## action_logs


```sql
id

agent_action

reason

result

timestamp

```

---

# 13. Memory Pipeline Implementation


流程：

```text
Conversation

↓

Memory Candidate Generator

↓

Scoring Model

↓

Deduplication

↓

Conflict Detection

↓

Storage

```

---

# 14. Embedding Strategy


每个对象生成：

Embedding。


包括：

- Thought
- Memory
- Decision
- Project


---

例如：

Thought：

```
AI应该隐藏，而不是主动出现
```

Embedding：

关联：

- AI UX
- Product Philosophy
- Nimbus

---

# 15. Planning Engine Implementation


第一阶段：

规则 + AI。


不要直接做复杂优化算法。


---

输入：

```text
Commitment

Calendar

Preference

Deadline

```

---

流程：

```text
Filter Available Time

↓

Rank Tasks

↓

Generate Schedule

↓

Validate

↓

Save

```

---

# 16. Notification System


不要传统 Reminder。


采用：

Event Driven。


---

事件：

```text
Deadline approaching

Risk increased

Dependency completed

Calendar changed

```

---

Notification：

```text
Should Notify?

↓

Importance

↓

Urgency

↓

User Preference

```

---

# 17. Connector Architecture


未来支持：

- Calendar
- Mail
- Slack
- GitHub
- Notion
- Files


统一接口：

```typescript
Connector {

connect()

read()

write()

observe()

}

```

---

# 18. AI Action Sandbox


所有外部动作：

进入 Sandbox。


---

例如：

发送邮件。


流程：

```text
Agent

↓

Action Proposal

↓

Permission Check

↓

User Confirm

↓

Execute

↓

Log

```

---

# 19. Security Implementation


## Client

- Keychain
- Secure Enclave


## Backend

- Encryption at Rest
- Encryption in Transit


## Memory

- User-owned
- Exportable
- Deletable


---

# 20. MVP Technical Scope


第一版：

## Client

macOS App


功能：

- Input
- Today
- Thought
- Commitment


---

## Backend

必须：

- Auth
- Agent Runtime
- Memory Service
- Calendar Connector


---

## Database

PostgreSQL

Vector Search


---

# 21. MVP Development Order


## Sprint 1

基础框架


完成：

- App
- Backend
- User


---

## Sprint 2

Input Intelligence


完成：

- Input Agent
- Intent Detection
- Object Creation


---

## Sprint 3

Work Planning


完成：

- Calendar
- Commitment
- Today


---

## Sprint 4

Memory


完成：

- Preference Memory
- Project Memory


---

## Sprint 5

Autonomy


完成：

- Auto adjustment
- Agent Log


---

# 22. 技术风险


## Risk 1

Memory污染


解决：

人工确认 + Score。


---

## Risk 2

Agent不可预测


解决：

Structured Output。


---

## Risk 3

成本过高


解决：

Model Router。


---

## Risk 4

隐私问题


解决：

Local First。


---

# 23. 最终技术目标


形成：

```text
Personal AI Runtime


=

Memory Engine

+

Planning Engine

+

Reasoning Engine

+

User Model

+

Action System

```

---

# 总结

技术实现的关键不是“接一个大模型”。

而是建立：

> 一个围绕用户长期上下文运行的 Agent Runtime。

模型会变化。

但是：

- 用户模型
- Memory Graph
- Decision History
- Planning System

才是长期资产。

---

下一部分：

# 13. Product Metrics & Experiment Design

会设计：

- 如何判断 MVP 是否成功
- 哪些数据证明用户真的需要它
- Activation
- Retention
- Agent Trust
- Memory Value
- 如何做早期用户测试。