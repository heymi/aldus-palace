# 7. Memory System Technical Design（长期记忆系统技术设计）
# 7. Memory System Technical Design（长期记忆系统技术设计）

Version: 1.0

---

# 1. Memory 系统目标

Memory 不是聊天记录存档。

目标：

> 建立一个持续理解用户的个人认知模型。

普通 AI：

```
Conversation
 ↓
Context Window
 ↓
Forget
```

Personal Agent：

```
Experience

↓

Memory Processing

↓

Structured Memory

↓

Context Retrieval

↓

Better Decision
```

---

# 2. Memory 设计原则

## Principle 1：记住“有价值的信息”，不是所有信息

错误：

保存所有聊天。

结果：

- 噪音越来越多
- 检索质量下降
- AI 被过去束缚


正确：

保存：

- 稳定偏好
- 长期原则
- 项目背景
- 决策原因
- 重要关系
- 工作模式

---

# Principle 2：Memory 是动态系统

Memory 不是：

Create → 永久保存。


而是：

```
Create

↓

Strengthen

↓

Update

↓

Supersede

↓

Archive
```

---

# Principle 3：Memory 必须可解释

用户必须知道：

AI 为什么这样理解自己。

---

例如：

```
Memory:

喜欢简单产品设计


来源：

过去18次设计讨论中，
12次拒绝复杂方案


置信度：

91%
```

---

# 3. Memory 类型体系

完整 Memory 分类：

```
Memory

├── Identity
│
├── Preference
│
├── Principle
│
├── Goal
│
├── Project Context
│
├── Decision
│
├── Relationship
│
├── Knowledge
│
├── Habit
│
└── Episode
```

---

# 4. Identity Memory

## 定义

稳定身份信息。


变化周期：

几年。


---

示例：

```
Role:

Founder


Domain:

Software


Interest:

AI
Design
Consumer Apps
```

---

来源：

用户明确输入。

不应该大量推断。

---

# 5. Preference Memory

## 定义

用户偏好。


变化周期：

月/年。


---

示例：

```
Writing Preference:

喜欢：

自然表达


避免：

营销腔
AI味
```

---

来源：

三种：

1. 用户明确表达

2. 多次行为选择

3. 长期反馈

---

# 6. Principle Memory

最高价值。


## 定义

用户长期原则。


例如：

```
AI should assist, not dominate.
```

---

特点：

- 影响多个项目
- 影响未来决策
- 高稳定性


---

生成条件：

满足：

```
重复出现

+

影响决策

+

用户认可
```

---

# 7. Project Context Memory

## 定义

项目长期背景。


例如：

```
Project:

Nimbus


Position:

Calm email client


Avoid:

AI-first experience


Audience:

Privacy-focused users
```

---

作用：

避免用户每次重新解释项目。

---

# 8. Decision Memory

非常关键。


## 保存：

不是：

“选择了什么”。

而是：

“为什么选择”。

---

结构：

```
Decision

What:

Keep macOS only


Why:

Protect native experience


When:

2026-07


Status:

Active
```

---

未来：

用户：

> 为什么不做 Windows？

AI：

直接回答。

---

# 9. Relationship Memory

## 定义

人与人的上下文。


例如：

```
Person:

Ken


Role:

Designer


Project:

Nimbus


Current:

Waiting feedback
```

---

未来：

AI：

> Ken 上次负责 UI 反馈，目前还有一个待确认设计问题。

---

# 10. Habit Memory

## 定义

行为规律。


例如：

```
Pattern:

Morning:

Deep work


Afternoon:

Meetings
```

---

来源：

长期观察。


需要低置信度开始。

---

# 11. Episode Memory

## 定义

事件记忆。


类似人的经历。


例如：

```
2026-07-18

Discussed:

AI positioning


Conclusion:

Reduce AI visibility
```

---

特点：

短期。


可能衰减。

---

# 12. Memory Pipeline


完整流程：

```
New Information

↓

Candidate Extraction

↓

Classification

↓

Scoring

↓

Deduplication

↓

Conflict Detection

↓

Storage

↓

Retrieval
```

---

# 13. Candidate Extraction

每次：

Conversation / Event / Action

进入分析。


提取：

```
Possible Memory:

"User dislikes complex UI"
```

---

但是：

此时只是 Candidate。


---

# 14. Memory Scoring Algorithm


每条 Memory 有：

## Importance Score


```
Importance =


Explicitness

+

Frequency

+

Impact

+

Project Coverage

+

Future Relevance
```

---

## Explicitness

用户明确说：

高。


例如：

> 以后不要这样设计。


---

## Frequency

重复次数。


一次：

低。


十次：

高。


---

## Impact

影响范围。


只影响一个任务：

低。


影响所有产品：

高。


---

## Future Relevance

未来是否有价值。


---

# 15. Confidence Score


区别：

Importance：

值不值得保存。


Confidence：

是否准确。


---

例如：

AI观察：

用户喜欢极简。

Importance:

高。


Confidence:

60%。


需要更多证据。

---

# 16. Memory Decision


规则：

```
Importance > 0.8

AND

Confidence > 0.8

↓

Active Memory
```

---

否则：

Candidate。


---

# 17. Memory Deduplication


避免：

```
喜欢简单设计

喜欢简洁产品

不喜欢复杂功能

偏好Minimal UI
```

变成4条。


---

合并：

```
Principle:

Prefer simplicity over feature quantity.

Evidence:

4 previous memories
```

---

# 18. Memory Conflict Resolution


必须支持。


例如：

旧：

```
User avoids subscriptions
```

新：

```
Subscription accepted for AI features
```

---

处理：

不是删除。

而是：

```
Old Memory:

Superseded


New Memory:

Active
```

---

保存：

时间线。


---

# 19. Memory Decay（遗忘机制）


不是所有 Memory 永久有效。


---

## 稳定 Memory

不衰减：

- 身份
- 核心原则


---

## 半稳定 Memory

慢衰减：

- 工作习惯
- 偏好


---

## 临时 Memory

快速衰减：

- 当前状态
- 短期兴趣


---

示例：

```
喜欢深色UI

一年没提

↓

Confidence下降
```

---

# 20. Memory Retrieval System


核心：

不要全部加载。


---

流程：

```
Current Query

↓

Context Analyzer

↓

Memory Search

↓

Ranking

↓

Context Assembly
```

---

# 21. Retrieval Ranking


排序：

```
Score =


Semantic Match

×

Importance

×

Confidence

×

Recency

×

Project Relevance
```

---

例如：

用户：

> 写官网。


召回：

高：

```
Brand Principle
Nimbus Context
Writing Style
```

低：

```
去年旅行计划
```

---

# 22. 三层存储架构


## Layer 1

Relational Database


保存：

结构。


例如：

PostgreSQL。


---

## Layer 2

Vector Database


保存：

语义。


用于：

“找类似想法”。

---

## Layer 3

Graph Database


保存：

关系。


例如：

```
Decision

↓

Thought

↓

Project

↓

Person
```

---

# 23. Memory Graph


最终：

不是列表。


而是一张个人认知网络。


例如：

```
                Simplicity

                    |

        ┌───────────┴───────────┐

        |                       |

      Nimbus                  SkinCast

        |                       |

      Design                 UX

        |

     AI Position
```

---

# 24. Context Assembly


最终给 LLM 的不是：

所有 Memory。


而是：

```
Current Goal

+

Relevant Project

+

Relevant Principles

+

Recent Events

+

User Preferences
```

---

示例：

写 Nimbus 官网：

输入：

```
Need homepage copy
```

Context：

```
Project:

Nimbus


Principles:

Calm
Native
Privacy


Writing:

Short
Natural
No hype
```

---

# 25. 用户 Memory 控制中心


必须提供。


页面：

```
My Memory


About Me


Preferences


Principles


Projects


Relationships
```

---

每条：

显示：

```
Memory:

喜欢简单设计


Why:

18次设计选择


Confidence:

91%


Actions:

✓ Keep

✕ Delete

Edit
```

---

# 26. Privacy Design


Memory 是最高敏感数据。


必须：

## Encryption

静态加密。


## User Ownership

用户拥有。


## Export

可导出。


## Delete

彻底删除。


## Transparency

显示来源。


---

# 27. Memory MVP


第一版：

只做：

```
Preference

Project Context

Decision

Principle Candidate
```

---

不做：

- 自动人格分析
- 深层行为预测
- 关系推断


---

# 28. Memory 未来能力


成熟后：

AI 可以说：

> 我发现你过去半年所有产品都遵循一个共同原则：减少用户认知负担。是否把它作为你的产品设计原则？


---

# 29. Memory 的最终价值


普通 AI：

知道你说过什么。


Personal Agent：

知道：

- 你为什么这么想
- 你过去如何选择
- 什么事情对你重要
- 什么原则不会轻易改变


---

# 核心总结

Memory 系统不是为了让 AI “记更多”。

而是：

> 让 AI 形成一个不断成长的用户认知模型。


这才是 Personal AI Agent 与普通聊天 AI 的根本区别。


---

下一部分：

# 8. AI Planning Engine Technical Design

将设计：

- 任务排序算法
- 时间安排算法
- 动态重排机制
- 循环任务调度
- 冲突解决
- 如何让 AI 像真正 COO 一样管理工作流。