好的。下一步进入产品落地层。

前面的文档解决的是 **产品理念和用户体验**，但真正实现这个系统，需要两个核心设计：

1. **Agent Core Architecture（AI Agent 技术架构）**
   - AI 如何理解输入
   - 多 Agent 如何协作
   - Memory 如何召回
   - Planning 如何执行
   - Autonomy 如何控制

2. **Object Model & Database Schema（数据模型）**
   - Thought、Commitment、Memory 等对象如何存储
   - 对象之间如何关联
   - 如何支持长期演化

下面先输出第 1 部分。

---

# Agent Core Architecture
# 1. Agent Core Architecture

Version: 1.0

---

# 1. 总体架构

## 核心目标

构建一个：

- 能理解自然语言
- 能维护长期上下文
- 能自主规划
- 能持续观察
- 能逐渐了解用户

的 Personal Agent。

---

## 总体架构

```
                    User Input
                 Text / Voice / Event

                          ↓


                 Input Processing Layer


                          ↓


              ┌─────────────────────┐
              │  Cognitive Engine    │
              └─────────────────────┘


        ┌──────────┬──────────┬──────────┐

        ↓          ↓          ↓

 Intent      Thought       Entity
 Engine      Engine        Engine


        ↓          ↓          ↓


        ┌──────────┬──────────┐

        ↓          ↓

 Work       Memory
 Engine     Engine


        ↓          ↓


      Planning Engine


        ↓


    Autonomy Engine


        ↓


 External Actions


        ↓


 Feedback Loop


        ↓


 User Model Update
```

---

# 2. Agent 核心模块

整个 Agent 不应该是一个大模型。

应该拆成多个职责明确的 Agent。


---

# 2.1 Input Agent（输入代理）

## 职责

处理所有输入入口：

- 文本
- 语音
- 快速记录
- 系统事件


输入：

```
"刚想到 Nimbus Classic 应该强调纯邮件体验，下周调整官网"
```

输出：

结构化输入：

```json
{
 "content":
 "Nimbus Classic 应该强调纯邮件体验",
 
 "source":
 "voice",

 "timestamp":
 "2026-07-18"
}
```

---

# 2.2 Understanding Agent（理解代理）

负责：

> 用户到底表达了什么。


任务：

- 意图识别
- 情绪识别
- 时间理解
- 约束识别
- 隐含目标识别


输入：

```
下周优化官网
```

理解：

不是简单 Task。

可能：

```
Goal:
提升官网表达

Action:
修改文案

Window:
next week

Project:
Nimbus
```

---

# 2.3 Intent Agent（意图分析）

输出：

```json
{
 "intent": [
   {
    "type":"Plan",
    "confidence":0.82
   },
   {
    "type":"Think",
    "confidence":0.91
   }
 ]
}
```

---

支持 Intent：

```
Capture

Think

Remember

Decide

Plan

Execute

Research

Review

Communicate
```

---

# 2.4 Thought Agent（思想代理）

负责：

识别：

- 想法
- 洞察
- 原则
- 决策


例如：

输入：

> AI不应该主导邮件体验。


输出：

```
Thought:

AI Positioning Principle


Candidate Memory:

AI should assist, not dominate.
```

---

# 2.5 Work Agent（工作代理）

负责：

把事情变成：

Commitment。


例如：

输入：

> 下周调整官网。


输出：

```json
{
"type":"Commitment",

"title":
"调整官网定位",

"deadline":
"next week",

"duration":
"60min"
}
```

---

# 2.6 Memory Agent（记忆代理）

负责：

决定：

什么值得记住。


流程：

```
New Information

↓

Memory Evaluation

↓

Importance Score

↓

Create / Update / Ignore
```

---

例如：

普通：

> 今天喜欢蓝色。

忽略。


长期：

> 我不喜欢复杂软件。

保存。

---

# 2.7 Planning Agent（规划代理）

核心。


负责：

把所有 Commitment 安排到现实世界。


输入：

```
Tasks

+
Calendar

+
User Model

+
Current State
```

输出：

```
Today Plan
```

---

考虑：

- 时间
- 能量
- 优先级
- 截止时间
- 依赖
- 用户习惯

---

# 2.8 Monitoring Agent（监控代理）

持续运行。


观察：

```
Calendar Change

Task Status

Email Response

Deadline

External Event
```

---

例如：

发现：

客户三天没有回复。


生成：

```
Risk:

Customer waiting too long.

Suggestion:

Follow up today.
```

---

# 2.9 Autonomy Agent（自主代理）

决定：

AI 是否行动。


输入：

```
Action Proposal
```

判断：

```
Risk

Impact

Confidence

User Preference
```

输出：

```
Execute

Ask

Suggest

Ignore
```

---

# 3. Agent Memory Architecture

Memory 不直接给模型。


采用：

## Retrieval Augmented Personal Memory


结构：

```
User Request

↓

Context Analyzer

↓

Memory Retrieval

↓

Relevant Memory

↓

Prompt Assembly

↓

LLM
```

---

例如：

用户：

> 写 Nimbus 首页。


检索：

```
Project Memory:

Nimbus


Principles:

Native
Privacy
Calm


Past Decisions:

Avoid AI-first messaging
```

---

# 4. Context Assembly System

每次调用模型：

动态生成 Context。


结构：

```
Current Request

+

Current Project

+

Relevant Memory

+

Recent Events

+

User Preferences

+

Constraints
```

---

避免：

把几年聊天全部塞进去。

---

# 5. Agent State Machine

每个对象都有生命周期。


例如 Commitment：

```
Captured

↓

Analyzed

↓

Planned

↓

Scheduled

↓

Executing

↓

Completed

↓

Reviewed
```

---

Thought：

```
Captured

↓

Exploring

↓

Validated

↓

Converted

↓

Archived
```

---

Memory：

```
Candidate

↓

Confirmed

↓

Active

↓

Superseded

↓

Archived
```

---

# 6. Decision Framework

AI 每次行动前计算：


## Confidence

理解是否准确。


## Impact

影响大小。


## Risk

错误成本。


## Reversibility

是否可撤销。


---

规则：

|动作|策略|
|-|-|
|创建任务|自动|
|调整时间|自动|
|生成建议|自动|
|修改原则|确认|
|发送消息|确认|
|付款|确认|

---

# 7. Learning Loop

系统不断学习。


流程：

```
AI Suggestion

↓

User Response

↓

Feedback

↓

Update User Model

↓

Future Decision Improvement
```

---

例如：

AI：

> 周三上午安排深度工作。


用户：

经常接受。


更新：

```
Preference:

Morning deep work preferred.
```

---

# 8. Multi-Agent 协作流程


一次输入：

```
用户：

"最近觉得Nimbus首页太强调AI，下周重新调整一下"
```

---

流程：

## Input Agent

保存原文。


↓

## Understanding Agent

识别：

- 产品
- 时间
- 情绪


↓

## Thought Agent

发现：

产品原则变化。


↓

## Work Agent

创建：

官网调整任务。


↓

## Memory Agent

判断：

是否形成品牌原则。


↓

## Planning Agent

安排时间。


↓

## Autonomy Agent

决定是否直接执行。


---

# 9. 技术实现建议


## LLM Layer

负责：

- 理解
- 推理
- 生成


---

## Structured Output Layer

所有 Agent 输出必须结构化。


不要：

纯文本。


使用：

JSON Schema。


---

## Vector Memory

用于：

语义召回。


---

## Graph Database

用于：

关系。


例如：

```
User

↓

Project

↓

Decision

↓

Thought

↓

Task
```

---

## Event Stream

用于：

持续观察。


例如：

```
Calendar Changed

Task Completed

Email Received
```

---

# 10. 核心原则

## Agent 不是聊天机器人

聊天只是输入。


核心：

```
Understand

Remember

Plan

Act

Learn
```

---

## Agent 不应该拥有无限权限

自主性必须：

基于：

- 信任
- 风险
- 可撤销性


---

## Memory 是产品核心资产

模型能力会普及。

真正壁垒：

> AI 对用户长期理解的深度。

---

（下一部分继续：）

# 2. Object Model & Database Schema

会详细设计：

- User
- User Model
- Thought
- Commitment
- Decision
- Memory
- Project
- Relationship
- Event
- Recurrence Rule
- Action Log

以及它们之间的数据库关系。