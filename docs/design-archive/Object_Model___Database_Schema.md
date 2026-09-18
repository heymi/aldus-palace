# Object Model & Database Schema
# 2. Object Model & Database Schema

Version: 1.0

---

# 1. 数据模型设计原则

## 核心原则

不要按照传统生产力软件设计：

```
Task
Calendar
Note
Reminder
```

因为这些是表现形式，不是人的真实工作结构。

真实世界：

```
用户
 |
 ├── 想法
 |
 ├── 决策
 |
 ├── 目标
 |
 ├── 承诺
 |
 ├── 行动
 |
 ├── 关系
 |
 └── 经验
```

因此底层模型应该围绕：

- 人（User）
- 上下文（Context）
- 思考（Thought）
- 承诺（Commitment）
- 记忆（Memory）
- 关系（Relationship）
- 事件（Event）

建立。

---

# 2. 核心 Entity 总览


```
User

│

├── UserProfile
│
├── Goal
│
├── Principle
│
├── Preference
│
├── WorkingPattern
│
├── Project
│
├── Thought
│
├── Commitment
│
├── Decision
│
├── Memory
│
├── Relationship
│
├── Event
│
├── RecurrenceRule
│
├── ActionLog
│
└── ContextSnapshot

```

---

# 3. User（用户核心对象）

## User

代表一个人的身份。

```json
{
  "id": "user_001",

  "name": "User",

  "timezone": "Asia/Tokyo",

  "language": "zh-CN",

  "created_at": "2026-07-18"
}
```

---

关联：

```
User

1:N

Project

Thought

Commitment

Memory
```

---

# 4. UserProfile（用户画像）

保存稳定身份信息。

区别：

User 是账户。

UserProfile 是 AI 对人的理解。

---

Schema:

```json
{
"user_id":

"role": [
 "Founder",
 "Developer"
],

"industry": [
 "Software",
 "AI"
],

"focus_area":[
 "Product",
 "Growth"
]
}
```

---

用途：

决定 AI 回答方式。

例如：

创业者：

关注：

- 战略
- ROI
- 优先级


普通用户：

关注：

- 使用方法

---

# 5. Goal（目标模型）

目标不是任务。

是长期方向。


Schema:

```json
{
"id":

"title":
"Build global software products",

"type":
"long_term",

"status":
"active",

"importance":
0.95,

"parent_goal": null
}
```

---

支持层级：

```
Life Goal

↓

Business Goal

↓

Project Goal

↓

Action
```

---

例如：

```
打造全球软件品牌

↓

Nimbus成为国际邮件产品

↓

提高官网转化

↓

修改首页文案
```

---

# 6. Project（项目模型）

项目是上下文容器。

不是任务集合。

---

Schema:

```json
{
"id":

"name":
"Nimbus Mail",

"description":

"macOS native email client",

"status":
"active",

"goals":[]
}
```

---

Project 包含：

```
Project

├── Thoughts

├── Decisions

├── Commitments

├── Memories

├── Documents

└── People
```

---

# 7. Thought（思想对象）


核心对象。


Schema:

```json
{
"id":

"type":
"Insight",

"content":

"AI should assist, not dominate",

"project_id":

"orvia",

"importance":

0.85,

"maturity":

"exploring",

"created_at":

"2026-07-18"
}
```

---

Type:

```
Idea

Insight

Observation

Question

Research

Principle

Note
```

---

关系：

```
Thought

↓

Decision

↓

Commitment

↓

Memory
```

---

# 8. Commitment（工作承诺对象）


替代 Task。

代表：

> 用户希望某件事情最终发生。


Schema:

```json
{
"id":

"title":
"Update Nimbus homepage",

"goal":

"Improve positioning",

"status":

"planned",

"deadline":

"2026-07-25",

"duration":

60,

"importance":

0.8
}
```

---

时间字段：

```json
{
"time_constraint":{

"type":
"flexible_window",

"window_start":

"2026-07-20",

"window_end":

"2026-07-25"

}
}
```

---

状态：

```
Captured

Planned

Scheduled

Executing

Completed

Cancelled

Risk
```

---

# 9. TimeConstraint（时间约束）


单独建模。


因为时间不是任务属性。


Schema:

```json
{
"type":

"deadline",

"value":

"2026-07-25"
}
```

---

Type:

```
FixedTime

Deadline

FlexibleWindow

AISlot
```

---

例：

会议：

```
FixedTime

2026-07-20 15:00
```

---

写文案：

```
FlexibleWindow

本周完成
```

---

# 10. Decision（决策对象）


非常重要。


记录：

为什么这样选择。


Schema:

```json
{
"id":

"title":

"Keep Nimbus macOS only",

"reason":

"Protect native experience",

"status":

"active",

"confidence":

0.9
}
```

---

用途：

未来回答：

> 为什么当初这么设计？


---

关系：

```
Decision

belongs_to

Project
```

---

# 11. Memory（长期记忆）


Memory 是 AI 长期理解基础。


Schema:

```json
{
"id":

"type":

"Principle",

"content":

"User prefers simple products",

"importance":

0.92,

"confidence":

0.88,

"source":

"Behavior analysis"
}
```

---

Type:

```
Identity

Preference

Principle

ProjectContext

Relationship

Event

Knowledge
```

---

# 12. Memory 生命周期


```
Candidate

↓

Evaluating

↓

Active

↓

Updated

↓

Superseded

↓

Archived
```

---

例如：

旧：

```
Avoid subscription
```

后来：

```
Subscription acceptable for AI features
```

旧 Memory:

```
Superseded
```

---

# 13. Preference（偏好模型）


区别：

Memory：

AI知道。


Preference：

明确偏好。


Schema:

```json
{
"type":

"Writing",

"preference":

"Natural English",

"avoid":

"Marketing language"
}
```

---

分类：

```
Writing

Design

Communication

Scheduling

Product

Decision
```

---

# 14. WorkingPattern（工作模式）


记录：

用户如何工作。


Schema:

```json
{
"deep_work_time":

"morning",

"meeting_preference":

"afternoon",

"task_style":

"large_blocks"
}
```

---

来源：

行为学习。

不是用户填写。

---

# 15. Relationship（关系模型）


人与人的长期上下文。


Schema:

```json
{
"id":

"name":

"Ken",

"role":

"Designer",

"context":

"Works on Nimbus UI"
}
```

---

关联：

```
Person

↓

Project

↓

Commitment

↓

Communication
```

---

# 16. Event（事件）


记录发生过什么。


Schema:

```json
{
"id":

"type":

"Calendar",

"title":

"Product meeting",

"time":

"2026-07-18 15:00"
}
```

---

Event 来源：

```
Calendar

Email

User Input

System
```

---

# 17. RecurrenceRule（循环规则）


循环任务核心。


Schema:

```json
{
"id":

"frequency":

"weekly",

"type":

"fixed_cycle",

"completion_policy":

"cover"
}
```

---

Type:

```
Fixed Calendar

Completion Based

Event Trigger
```

---

Policy:

```
Cover

Accumulate

Recover
```

---

# 18. ActionLog（行动日志）


记录 AI 做过什么。


非常重要。


Schema:

```json
{
"id":

"agent_action":

"Moved task to 16:30",

"reason":

"Meeting extended",

"user_response":

"accepted"
}
```

---

用途：

1. 可解释性

2. 信任建立

3. 模型学习

---

# 19. ContextSnapshot（上下文快照）


保存某个时间点 AI 对用户的理解。


例如：

2026年7月：

```
User focus:

Nimbus launch

Important:

Privacy positioning

Avoid:

AI overload
```

---

用于：

未来比较变化。

---

# 20. Entity Relationship（关系）


整体关系：

```
                     User

                      |

        ┌─────────────┼─────────────┐

        |             |             |

     Goal        Project        Memory


                      |

                  Thought


                      |

        ┌─────────────┴─────────────┐

        |                           |

    Decision                  Commitment


                                      |

                                RecurrenceRule



Relationship

Event

ActionLog

```

---

# 21. Vector + Graph + Relational 三层存储


单数据库无法满足。


建议：

---

## Relational Database

存：

结构化对象。

例如：

- Task
- User
- Project
- Time


推荐：

PostgreSQL。


---

## Vector Database

存：

语义搜索。

例如：

“关于 AI 定位的讨论”。


---

## Graph Database

存：

关系。


例如：

```
这个决定来自哪个想法？

这个原则影响哪些项目？

这个人参与哪些事情？
```

---

# 22. Memory Retrieval 查询流程


用户：

> 帮我设计官网。


流程：

```
Query

↓

Identify Context

↓

Retrieve:

Project Memory

+
Principles

+
Previous Decisions

+
Preferences

↓

Generate Context

↓

LLM
```

---

# 23. Object Evolution Example


用户输入：

> 我觉得 Nimbus Classic 应该像 Sparrow 一样简单。


系统：

生成：

```
Thought:

Classic positioning


↓


Possible Decision:

Avoid AI-first


↓


Commitment:

Update homepage


↓


Memory:

User prefers quiet software experience

```

---

# 24. MVP 数据模型


第一版不要全部实现。


最低：

```
User

Project

Thought

Commitment

Memory

Event

ActionLog
```

---

第二阶段：

```
Decision

Relationship

WorkingPattern

RecurrenceRule
```

---

第三阶段：

```
Graph Intelligence

User Model

Autonomous Learning
```

---

# 25. 最终数据核心


这个系统真正的数据资产不是：

任务列表。


而是：

```
User

+

Thought History

+

Decision History

+

Behavior Pattern

+

Project Context

+

Memory Graph

```


最终形成：

> 一个随着时间增长、越来越理解用户的个人认知模型。

```

---

这两部分（Agent Architecture + Object Model）完成后，下一步就是最关键的 **3. UX Flow & Interface Design**。

因为这个产品最大的风险不是技术，而是：

**用户打开以后，看到的是“AI操作系统”，还是“另一个复杂工具”。**

下一部分应该设计：

- 首次使用流程
- 输入框形态
- 首页结构
- Now/Today/Thought/Memory 的交互
- AI 主动介入时的 UI
- Mac Menu Bar / iPhone Widget 形态。