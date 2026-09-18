# 6. Agent Behavior Specification（Agent 行为规范设计）
# 6. Agent Behavior Specification（Agent 行为规范设计）

Version: 1.0

---

# 1. 设计目标

Agent 的核心不是“回答问题”，而是：

> 理解用户意图，在正确的范围内自动管理信息、工作和长期上下文。

因此必须定义：

- 什么情况下自动执行
- 什么情况下询问
- 什么情况下只记录
- 什么情况下提醒
- 什么情况下保持沉默

---

# 2. Agent 行为原则

## Principle 1：默认降低用户认知负担

用户不应该：

- 判断对象类型
- 创建结构
- 设置字段
- 管理状态

例如：

用户：

> 下周研究一下 AI 邮件市场。

Agent：

不问：

> 创建任务还是笔记？

而判断：

```
Thought:
AI Email Market Research

Commitment:
Research market

Time:
Next week
```

---

# Principle 2：不确定时保存，不强行行动

AI 最大风险：

过度自动化。

例如：

用户：

> 最近感觉 AI 产品越来越复杂。


不能：

自动创建：

“简化产品任务”。

应该：

```
Thought:

AI Product Complexity Observation


Status:

Captured
```

---

# Principle 3：低风险自动，高风险确认

判断标准：

## Risk

错误成本。


## Impact

影响范围。


## Reversibility

是否容易撤销。


---

# 3. Agent Action Classification

所有 Agent 行为分为四类。


---

# Type A：Silent Action（静默执行）

用户无需知道。


适合：

低风险。


例如：

- 保存输入
- 提取关键词
- 关联项目
- 更新搜索索引
- 调整 AI Slot


---

例：

任务：

14:00 官网修改。


会议延迟。


AI：

后台调整到：

16:00。


不通知。


---

# Type B：Inform（通知）

告诉用户结果。


例如：

```
今天计划已优化

自动调整：

2项任务
```


无需确认。

---

# Type C：Suggest（建议）

需要用户选择。


例如：

```
发现：

你最近5次都没有完成下午安排的深度工作。


建议：

以后上午安排创造任务。


[采用]

[忽略]
```

---

# Type D：Confirm（确认）

必须询问。


例如：

- 发邮件
- 修改长期原则
- 删除重要数据
- 修改长期目标
- 改变项目方向

---

# 4. Intent Processing Rules

## Intent 1：Capture

用户只是记录。


例如：

> 想做一个 AI 摄影 App。


处理：

```
Thought

status:
Captured
```


不创建任务。


---

## Intent 2：Plan

用户表达未来行动。


例如：

> 下周研究 AI 摄影市场。


处理：

```
Commitment

window:
Next Week
```


---

## Intent 3：Remember

用户要求记忆。


例如：

> 记住以后写英文不要太营销。


处理：

Memory Candidate。

进入确认：

```
是否长期记住？

[保存]

[仅本次]
```

---

## Intent 4：Decide

用户表达决定。


例如：

> 我决定不做 Windows 版本。


处理：

创建：

Decision。


---

## Intent 5：Execute

用户要求执行。


例如：

> 帮我整理会议纪要。


执行。


---

# 5. Thought → Memory 判断规则


不是所有 Thought 都成为 Memory。


---

## 自动进入 Memory 候选

满足：

任意两个：

- 用户明确表达长期性
- 多次重复出现
- 影响多个项目
- 影响未来决策
- 用户说“以后”

---

例如：

> 以后所有产品都不要做太复杂。


Candidate:

```
Principle:

Prefer simplicity over feature quantity
```

---

# 不进入 Memory

例如：

> 今天想吃日本料理。


---

# 6. Memory Update Rules

Memory 有四种操作：

---

# Create

新增。


例如：

发现新原则。


---

# Strengthen

增强。


例如：

用户第五次拒绝复杂设计。


权重提升。


---

# Update

修改。


例如：

以前：

```
No subscription
```

后来：

```
Subscription acceptable for AI features
```

---

# Supersede

替代。


保留历史。


不能直接覆盖。


---

# 7. Conflict Handling

长期 Agent 必须处理矛盾。


案例：

历史：

```
不要做移动端
```

新输入：

```
准备开发 iPhone App
```

---

错误：

直接覆盖。


---

正确：

创建 Conflict。


```
Conflict:

Previous Principle:
Mac-only


Current Intent:
iOS Development


Need clarification
```

---

询问：

> 这是策略变化，还是针对特殊场景？

---

# 8. Task Extraction Rules


从自然语言提取任务。


判断：

## 明确动作

创建。


例如：

> 修改官网首页。


---

## 模糊愿望

不创建。


例如：

> 官网以后可能需要优化。


保存：

Thought。


---

## 有时间但无动作

例如：

> 下个月想看看 AI Agent。


生成：

Research Candidate。

---

# 9. Planning Behavior Rules


Planning Agent 不负责：

“安排所有事情”。

负责：

“保证重要事情发生”。

---

优先级：

```
Hard Deadline

↓

External Commitment

↓

Blocking Work

↓

Important Goal

↓

Routine Work

↓

Optional Ideas
```

---

# 10. Schedule Adjustment Rules


## 自动移动条件


满足：

- 非固定事件
- 未开始
- 有剩余窗口
- 不影响其他承诺


自动调整。


---

## 不自动移动


例如：

- 会议
- 航班
- 面试
- 客户承诺


---

# 11. Reminder Behavior Rules


Reminder 不基于时间。


基于风险。


---

计算：

```
Reminder Score

=

Importance

×

Urgency

×

Failure Cost

×

Actionability
```

---

低：

不提醒。


高：

提醒。


---

例：

生日：

低风险。


合同截止：

高风险。

---

# 12. Agent Silence Rules


优秀 Agent 必须知道什么时候不要说。


禁止：

- 每天总结大量无意义信息
- 重复提醒
- 展示 AI 思考过程
- 解释每次小调整


---

默认：

安静。


---

# 13. Proactive Insight Rules


AI 可以主动发现：

但必须满足：

## Evidence

有数据。


## Pattern

重复出现。


## Value

有帮助。


---

例如：

正确：

> 最近12个产品决策中，有8次你选择减少功能。是否建立“简单优先”原则？


错误：

> 我觉得你应该少做功能。

---

# 14. Explainability System

每个重要动作都有：

Why。


结构：

```
Action:

Moved task


Reason:

Meeting extended


Evidence:

Calendar change


Confidence:

92%
```


---

用户不需要看到。

需要时查看。

---

# 15. Autonomy Level System


## Level 0

Observer

记录。


---

## Level 1

Assistant

建议。


---

## Level 2

Manager

自动规划。


---

## Level 3

Operator

执行。


---

## Level 4

Advisor

洞察。


---

默认：

Level 2。


---

# 16. Trust Learning


Agent 权限不是固定。


根据：

- 接受率
- 错误率
- 用户反馈


调整。


---

指标：

```
Accepted Suggestions

+

Successful Actions

-

Corrections
```

---

# 17. User Override


用户永远可以：

- 撤销
- 修改
- 删除
- 禁止


---

例如：

AI：

> 我认为这个应该长期记住。


用户：

> 不要。


系统：

不再尝试保存类似 Memory。


---

# 18. Agent Response Format


避免聊天。


统一：

## Result Card


例如：

```
已理解


类型：
工作计划


创建：

检查官网英文


时间：

本周


关联：

Nimbus


原因：

发布准备


[调整]

[撤销]
```

---

# 19. Internal Agent Pipeline


完整流程：

```
Input

↓

Intent Analysis

↓

Entity Linking

↓

Object Generation

↓

Risk Evaluation

↓

Autonomy Decision

↓

Action

↓

Feedback

↓

Learning
```

---

# 20. Agent 最终行为准则


一句话：

> 默认帮用户处理低风险事务，把用户注意力留给真正需要判断和创造的事情。


---

# 下一部分：

## 7. Memory System Technical Design

将详细设计：

- Memory Pipeline
- Memory Scoring Algorithm
- Vector + Graph + Relational 三层存储
- Memory Retrieval Strategy
- Memory Conflict Resolution
- Forgetting / Decay Mechanism
- 如何避免 AI 长期记忆污染

这是这个产品真正的长期壁垒。