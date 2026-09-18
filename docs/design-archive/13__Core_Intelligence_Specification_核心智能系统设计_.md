# 13. Core Intelligence Specification（核心智能系统设计）
# 13. Core Intelligence Specification（核心智能系统设计）

Version: 1.0

---

# 0. 核心定义

Aldus Palace 的核心不是一个聊天模型，而是一套持续运行的智能系统。

核心智能层负责：

1. **理解用户输入**
2. **决定什么值得记住**
3. **决定什么时候行动**
4. **决定如何安排现实工作**
5. **决定调用什么 AI 能力**

---

整体架构：

```text
                    User Experience


                          ↑


                Core Intelligence Layer


 ┌─────────────────────────────────────────────┐
 │                                             │
 │  Memory Intelligence Engine                 │
 │                                             │
 │  Planning Intelligence Engine               │
 │                                             │
 │  Trust & Autonomy Engine                    │
 │                                             │
 │  Model Orchestration Engine                 │
 │                                             │
 └─────────────────────────────────────────────┘


                          ↑


                  Data / Context Layer


                          ↑


                  User / Environment

```

---

# Part 1
# Memory Intelligence Engine

## 1.1 目标

解决：

> AI 如何长期理解一个人，而不是简单保存聊天记录。


核心问题：

- 什么值得记？
- 什么应该忘？
- 如何更新旧认知？
- 如何避免错误记忆污染？

---

# 1.2 Memory 类型体系

Memory 分为五个等级：

---

## Level 0：Raw Experience

原始经历。

例如：

用户说：

> 今天觉得新的 AI 邮件产品都太吵。

保存：

```json
{
"type":"experience",
"content":"AI email products feel noisy"
}
```

特点：

不影响 AI 行为。

---

## Level 1：Observation

观察。


例如：

多次发现：

用户不喜欢复杂界面。


```json
{
"type":"observation",
"pattern":
"user prefers simpler interfaces"
}
```

---

## Level 2：Preference

偏好。


例如：

```text
喜欢：

简洁设计

避免：

复杂设置
```

可以影响：

UI建议、文案。

---

## Level 3：Principle

原则。


最高价值。


例如：

```text
AI should assist, not dominate.
```

影响：

多个项目决策。

---

## Level 4：Identity Model

身份模型。


例如：

```text
Founder

Builds consumer software

Values simplicity and craft
```

---

# 1.3 Memory Formation Pipeline

完整流程：

```text
User Experience

↓

Extraction

↓

Candidate Memory

↓

Evaluation

↓

Conflict Check

↓

Storage

↓

Activation

↓

Retrieval

```

---

# 1.4 Memory Candidate Extraction


每次输入后：

Memory Agent 判断：

是否产生候选。


判断因素：

---

## Temporal Signal

是否有长期词：

- 以后
- 永远
- 通常
- 一直
- 我的原则


---

## Behavioral Signal

是否反复出现。


例如：

过去20次：

拒绝复杂设计。


---

## Impact Signal

是否影响未来决策。


例如：

产品定位。

---

## Scope Signal

是否跨项目。


例如：

“喜欢Apple风格”。

影响：

所有 App。


---

# 1.5 Memory Scoring


公式：

```
Memory Value Score

=

Explicitness
+
Frequency
+
Impact
+
Scope
+
Future Relevance

```


---

## Example


输入：

> 我觉得软件应该少一点功能。


评分：

Explicitness:
0.8


Frequency:
0.6


Impact:
0.8


Scope:
0.7


Future:
0.8


结果：

Candidate Memory。

---

# 1.6 Memory Pollution Prevention

这是核心。


## Rule 1

短期状态不能升级为长期记忆。


错误：

```
今天喜欢蓝色
```

不能成为：

```
User likes blue
```

---

## Rule 2

单次推断不能成为原则。


错误：

AI：

> 用户喜欢极简。


依据：

一次反馈。


---

正确：

至少：

- 多次行为
- 明确表达
- 用户确认

---

## Rule 3

Memory 必须有 Evidence。


每条 Memory：

必须记录：

```json
{
"memory":
"User prefers simplicity",

"evidence":[

"Rejected complex UI proposal",

"Removed unnecessary features"

]
}
```

---

# 1.7 Memory Update System


Memory 不覆盖。


采用：

版本化。


---

例如：

旧：

```text
No subscription
```

后来：

```text
Subscription acceptable for AI features
```

系统：

```text
Memory A

Status:
Superseded


Memory B

Status:
Active

```

---

# 1.8 Memory Decay


不同 Memory 不同生命周期。


|Memory|Decay|
|-|-|
|Identity|无|
|Principle|慢|
|Preference|中|
|Habit|快|
|Current State|很快|

---

# Part 2
# Planning Intelligence Engine

---

# 2.1 目标

不是：

生成日历。


而是：

> 在变化环境中持续保证重要事情发生。


---

# 2.2 Planning 输入


Planner 获取：

```
Commitment

+

Calendar

+

Deadline

+

User Model

+

Energy Pattern

+

Historical Performance

```

---

# 2.3 Constraint Model


每个事项拆成：

---

## Hard Constraint


不可改变。


例如：

会议。

---

## Soft Constraint


尽量满足。


例如：

上午写代码。


---

## Preference Constraint


用户习惯。


例如：

晚上不工作。


---

## Dependency Constraint


依赖关系。


例如：

设计完成后开发。


---

# 2.4 Priority Calculation


动态优先级：


```
Priority

=

Impact

×

Urgency

×

Dependency

×

Goal Alignment

×

Risk

```


---

# 2.5 Scheduling Model


Planner 不直接安排。


先生成候选。


例如：

任务：

写方案。


生成：

```
Option A:

Tuesday 10:00


Option B:

Wednesday 14:00


Option C:

Thursday 09:30

```

---

然后评分。

---

# 2.6 Context Switching Cost


加入切换成本。


例如：

低：

```
写文档

↓

写方案
```


高：

```
写代码

↓

会议

↓

战略思考

```

---

Planner 优先：

减少切换。


---

# 2.7 Dynamic Replanning


触发事件：

- 新任务
- 日历变化
- 提前完成
- 延迟
- 外部回复


---

流程：

```
Event

↓

Impact Analysis

↓

Recalculate

↓

Update Plan

↓

Notify

```

---

# 2.8 Delay Model


取消：

Task overdue。


改：

Risk。


---

状态：

```
Healthy

Attention Needed

Risk

Missed Commitment

Completed

```

---

# Part 3
# Trust & Autonomy Engine

---

# 3.1 目标

解决：

> AI什么时候应该主动？


---

# 3.2 Action Risk Model


每个 AI 行为计算：

```
Risk

=

Impact

×

Irreversibility

×

Visibility

```

---

低风险：

自动。


高风险：

确认。


---

# 3.3 Autonomy Level


## Level 0

Observer


只观察。


---

## Level 1

Assistant


建议。


---

## Level 2

Manager


自动管理。


默认。


---

## Level 3

Operator


执行动作。


---

## Level 4

Advisor


主动洞察。


---

# 3.4 Trust Score


计算：


```
Trust

=

Accuracy

×

Acceptance Rate

×

Safety

```

---

Example：

AI安排任务：

100次。

用户接受：

95次。


Trust提升。


---

# 3.5 Permission Evolution


初期：

```text
Calendar:

Suggest
```

---

长期：

```text
Calendar:

Auto Schedule
```

---

但是：

发送邮件：

永远确认。

---

# 3.6 Proactive Rules


AI 主动必须满足：


## Evidence

有事实。


## Pattern

重复出现。


## Value

能帮助用户。


---

Example：

正确：

> 最近8个项目都出现范围膨胀，你是否需要建立功能控制原则？


错误：

> 你应该少做功能。

---

# Part 4
# Model Orchestration Engine

---

# 4.1 目标

解决：

> 不同 AI 模型如何协作。


---

# 4.2 Model 分类


## Fast Model

负责：

- 分类
- 提取
- 标记


特点：

便宜、快速。


---

## Reasoning Model

负责：

- 战略分析
- 复杂规划
- 冲突处理


---

## Embedding Model

负责：

Memory 搜索。


---

## Local Model

负责：

敏感信息。


---

# 4.3 Model Router


流程：

```
Input

↓

Task Classification

↓

Select Model

↓

Execute

↓

Validate

```

---

Example：

输入：

> 记住我喜欢简单设计。


Fast Model。

---

输入：

> 分析三个项目是否应该继续。


Reasoning Model。

---

# 4.4 Multi Model Strategy


推荐：

```
                Input


                  ↓


          Local Processing


                  ↓


        ┌──────────────┐

        │ Model Router │

        └──────────────┘


      ↓          ↓          ↓


Fast       Reasoning     Embedding


```

---

# 4.5 DeepSeek 适配策略


当前阶段：

DeepSeek 可以承担：


✅ Intent Extraction

✅ Thought Classification

✅ Memory Candidate

✅ Basic Planning


---

不建议完全依赖：

- 长期战略判断
- 高风险决策
- 复杂多目标规划


---

# Part 5
# Core Intelligence Loop


最终闭环：

```
User Input

↓

Understand

↓

Remember

↓

Plan

↓

Act

↓

Observe

↓

Learn

↓

Improve User Model

```

---

# 最终定义

Aldus Palace 的核心不是：

“大模型能力”。

而是：

四个智能系统共同工作：

```
Memory

知道你是谁。


Planning

知道事情如何发生。


Trust

知道什么时候介入。


Model Router

知道什么时候使用什么智能。

```

---

这四个系统构成真正的 Personal AI Agent 大脑。

下一步建议继续设计：

# 14. End-to-End Agent Runtime Flow

也就是一次真实用户输入，从按下语音按钮开始，到 AI 解析、Memory 更新、任务规划、UI反馈的完整时序图。

这个会直接指导工程实现。