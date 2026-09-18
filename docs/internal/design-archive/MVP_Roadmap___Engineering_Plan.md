# MVP Roadmap & Engineering Plan
# 4. MVP Roadmap & Engineering Plan

Version: 1.0

---

# 1. MVP 总目标

## 不追求做完整 AI 操作系统

第一阶段目标不是：

- 完整个人知识库
- 全自动生活管理
- 全能 Agent


而是验证最核心闭环：

```
用户输入一句自然语言

↓

AI理解真实意图

↓

生成结构化对象

↓

自动安排

↓

用户反馈

↓

系统越来越懂用户
```

---

# 2. MVP 核心验证问题

需要验证三个问题：

---

## Question 1

用户是否愿意放弃手动管理任务？

验证：

用户是否愿意只输入：

> “下周处理一下这个。”

而不是自己创建任务。

---

## Question 2

AI 自动规划是否比人工管理更舒服？

验证：

用户是否接受：

- 自动安排时间
- 自动调整计划
- 自动整理事项

---

## Question 3

长期 Memory 是否产生价值？

验证：

用户是否感觉：

> “它真的越来越懂我。”

---

# 3. MVP 产品范围

## 第一版只做 6 个核心能力

---

# Capability 1

# Universal Input

## 输入

支持：

- 文本
- 语音


入口：

一个输入框。


---

用户：

> “刚想到一个功能，可以把邮件自动整理成知识库，下周研究一下。”

---

系统：

解析：

```
Thought:

Email Knowledge Base Idea


Task:

Research feasibility


Time:

Next week
```

---

# Capability 2

# Thought + Commitment 双系统


第一版必须同时支持：

## Thought

想法。

## Commitment

行动。


否则：

会变成普通 Todo。

---

支持：

```
输入

↓

AI判断

↓

Thought

或者

Commitment

或者

两者都有
```

---

# Capability 3

# Calendar Integration


连接：

- Apple Calendar
- Google Calendar


第一阶段：

只读 + 写入。


能力：

读取：

- 已有会议
- 空闲时间


写入：

- AI安排的工作块


---

不做：

- 邮件
- 文件
- 第三方工具


---

# Capability 4

# AI Planning


核心体验。


输入：

```
今天需要：

修改官网

回复客户

准备发布

```

AI：

结合：

- 日历
- 时间
- 优先级


生成：

```
Today Plan

10:30
回复客户


14:00
修改官网


16:00
发布准备

```

---

# Capability 5

# Basic Memory


第一版不要做复杂知识图谱。


只做：

## User Memory


包括：

### Preference

例如：

```
喜欢：

简洁设计

自然英文表达
```

---

### Project Context

例如：

```
Nimbus:

macOS native

Privacy focus

```

---

### Principle


例如：

```
AI should assist, not dominate.
```

---

# Capability 6

# Agent Activity Log


建立信任。


记录：

AI 做了什么。


例如：

```
今天

调整任务：
2次


原因：

会议延期


新增记忆：

1条


来源：

你的重复反馈

```

---

# 4. MVP 不做什么

非常重要。


第一版禁止：

---

## ❌ 完整笔记系统

原因：

容易变成 Notion。

---

## ❌ 项目管理


不要：

- Kanban
- Board
- Sprint


---

## ❌ 文件管理


不要：

- 云盘
- 文档编辑


---

## ❌ 自动执行外部操作


不要：

- 自动发邮件
- 自动付款


---

## ❌ 复杂 Agent 市场


不要：

- 插件
- Workflow


---

# 5. MVP Architecture

## 技术架构


```
                 Client App

             macOS / iPhone

                    |

              API Gateway

                    |

        ┌────────────────────┐

        │    Agent Runtime    │

        └────────────────────┘


 Intent Agent

 Thought Agent

 Work Agent

 Memory Agent

 Planning Agent


                    |

        ┌───────────┬─────────┐

        Database    Vector DB

                    |

              External APIs

       Calendar / Mail / System

```

---

# 6. Client 端设计

## macOS First


原因：

目标用户：

- 创业者
- 开发者
- 知识工作者


工作中心：

Mac。


---

## macOS App


包含：

### Main Window

完整体验。


### Menu Bar


快速查看：

```
Now

Next

Capture
```


### Global Shortcut


例如：

Command + Space


快速输入。


---

# 7. Backend Design


## API Layer


负责：

- 用户认证
- 数据同步
- Agent请求


---

## Agent Runtime


核心。


负责：

调用不同 Agent。


---

例如：

输入：

```
用户文字
```

流程：

```
Input Agent

↓

Understanding Agent

↓

Object Creation

↓

Planning

↓

Response

```

---

# 8. Database MVP


第一版：

PostgreSQL。


表：

```
users

projects

thoughts

commitments

memories

events

action_logs

```

---

暂时不用：

Graph Database。


原因：

早期关系不会复杂到必须使用。


---

# 9. Memory MVP


不要做：

“万能记忆”。



第一阶段：

只保存：

## 明确价值信息。


例如：

用户明确说：

> 我不喜欢复杂的软件。


保存。


---

自动推断：

暂缓。


---

Memory Pipeline：

```
Conversation

↓

Candidate Memory

↓

Confidence Score

↓

User Confirm

↓

Save

```

---

# 10. AI Model Strategy


不要所有事情都交给大模型。


应该分层。


---

# Layer 1

Fast Model


负责：

- 分类
- 提取
- 判断


例如：

Intent。


---

# Layer 2

Reasoning Model


负责：

- 规划
- 决策
- 复杂分析


---

# Layer 3

Embedding Model


负责：

Memory Retrieval。


---

# 11. Local AI Strategy


未来方向：

本地模型处理：

- 简单分类
- 私密信息


云模型：

- 复杂推理
- 长期规划


---

架构：

```
Sensitive Data

↓

Local Model


Complex Reasoning

↓

Cloud Model

```

---

# 12. Agent Prompt Architecture


不要一个巨大 Prompt。


拆分。


---

## System Prompt

产品规则。


---

## User Model Context

用户长期信息。


---

## Project Context

项目背景。


---

## Current Task

当前输入。


---

## Memory Retrieval

相关记忆。


---

结构：

```
System

+

User Model

+

Relevant Memory

+

Current Input

```

---

# 13. Agent Evaluation System


必须建立测试。


否则 Agent 会越来越不可控。


---

测试案例：

## Case 1

混合输入


输入：

> 想做iOS版，下个月研究一下。


期待：

Thought + Commitment。


---

## Case 2

长期原则


输入：

> 以后产品不要做太复杂。


期待：

Memory Candidate。


---

## Case 3

冲突


已有：

不做移动端。


新：

开始做iOS。


期待：

Conflict。


---

## Case 4

循环任务


每周报告。


期待：

Recurring Rule。


---

# 14. 开发路线图


## Phase 0

## Prototype

时间：

2-4周


目标：

验证 Agent Loop。


功能：

- 输入
- AI解析
- 创建对象
- 简单展示


---

## Phase 1

## Personal Task Agent

时间：

2个月


功能：

✅ Input

✅ Thought

✅ Commitment

✅ Calendar

✅ Today Plan

✅ Basic Memory


目标：

每天真实使用。


---

## Phase 2

## Personal Context

时间：

3-4个月


增加：

- Project Memory
- Decision History
- User Preferences
- Relationship


目标：

AI开始理解用户。


---

## Phase 3

## Autonomous Agent


时间：

6个月+


增加：

- 自动调整
- 风险预测
- 主动建议
- 行为学习


---

# 15. 用户增长策略


不要定位：

AI Todo。


市场太拥挤。


---

定位：

## Personal AI Chief of Staff


目标用户：

第一批：

- 创业者
- 独立开发者
- 产品经理
- 投资人
- 高认知工作者


---

原因：

他们的问题不是：

“不知道怎么列任务。”

而是：

“事情太多，大脑上下文管理不过来。”

---

# 16. 核心竞争壁垒


## 1. Personal Memory Graph


时间越久越强。


---

## 2. User Work Model


理解：

用户如何工作。


---

## 3. Decision History


知道：

为什么这么选择。


---

## 4. Trust Calibration


知道：

什么时候主动。


---

# 17. 成功指标


## 北极星指标

不是：

任务完成数量。


而是：

### Reduced Cognitive Load


用户是否感觉：

> 我不用再记这些事情了。


---

指标：

### Weekly Active Use

每周使用天数。


---

### Capture Frequency

每天捕获多少想法。


---

### Agent Acceptance Rate

AI建议被接受比例。


---

### Memory Recall Success

AI调用正确背景比例。


---

### User Trust Score

用户是否愿意提高自动权限。


---

# 18. 最终产品路线


```
阶段1：

AI Task Manager


↓

阶段2：

AI Work Assistant


↓

阶段3：

AI Personal Knowledge System


↓

阶段4：

AI Personal Operating System

```

---

# 最终产品定义


不是帮助用户管理更多事情。


而是：

> 帮助用户减少管理事情本身。


用户负责：

- 思考
- 决策
- 创造


AI负责：

- 记录
- 整理
- 规划
- 提醒
- 学习


最终：

用户拥有一个随着时间越来越懂自己的 AI 工作伙伴。
```

---

到这里，四个核心文档已经完整：

1. **Product Vision & Design**
2. **Agent Core Architecture**
3. **Object Model & Database Schema**
4. **MVP Roadmap & Engineering Plan**

下一步如果继续，最值得做的是 **5. Competitive Analysis & Differentiation（竞品分析和定位）**，因为这个产品会同时碰到：

- Todoist / Things / TickTick
- Notion
- Motion / Reclaim
- ChatGPT
- Claude
- Apple Intelligence

需要明确它为什么不是另一个 AI 生产力工具。