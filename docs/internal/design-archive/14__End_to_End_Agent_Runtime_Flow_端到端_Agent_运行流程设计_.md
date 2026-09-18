# 14. End-to-End Agent Runtime Flow（端到端 Agent 运行流程设计）
# 14. End-to-End Agent Runtime Flow（端到端 Agent 运行流程设计）

Version: 1.0

---

# 1. 目标

前面的设计定义了：

- Memory Engine
- Planning Engine
- Trust Engine
- Model Router

但是工程实现需要回答：

> 用户说一句话之后，系统内部到底发生什么？

这一部分定义完整 Runtime Flow。

---

# 2. 总体 Agent Runtime

```text
User Input

(Text / Voice / Event)

        ↓

Input Processing

        ↓

Context Assembly

        ↓

Intent Understanding

        ↓

Entity Extraction

        ↓

Object Generation

        ↓

Memory Evaluation

        ↓

Planning

        ↓

Autonomy Decision

        ↓

Action Execution

        ↓

User Feedback

        ↓

Learning Loop

```

---

# 3. Stage 0：Input Capture

## 输入来源


```
User

├── Text

├── Voice

├── Shortcut

├── Widget

├── System Event

└── External Connector

```

---

例：

用户说：

> 最近想到 Nimbus Classic 可能应该弱化 AI，下周调整一下官网。


---

系统首先保存：

Raw Experience。


```json
{
"id":"input_001",

"content":
"最近想到 Nimbus Classic 可能应该弱化 AI，下周调整一下官网",

"source":
"voice",

"time":
"2026-07-18"
}
```

---

注意：

此时不做判断。

先保存原始信息。

---

# 4. Stage 1：Input Processing

## 任务

处理输入格式。


包括：

- 语音转文字
- 语言检测
- 清理噪音
- 分段


---

例如：

原始：

> 最近想到那个Classic版本啊，感觉AI不用放太前面，然后官网下周看看。


转换：

```text
Thought:

Classic版本不应该AI-first。


Action:

下周调整官网。
```

---

# 5. Stage 2：Context Assembly

这是关键。

AI 不应该只看当前一句话。


需要加载：

---

## Current Context

当前：

```
今天时间
当前项目
正在进行任务
```

---

## Project Context

例如：

```
Project:

Nimbus


Goal:

Build native email client


Position:

Calm
Privacy
Native

```

---

## User Model

例如：

```
Preference:

Avoid AI hype


Principle:

Simple experience first

```

---

## Relevant Memory

检索：

过去关于 AI 定位的讨论。


---

最终 Context：

```json
{
"input":

"Classic版本弱化AI",

"project":

"Nimbus",

"relevant_memory":[
"AI should assist not dominate"
],

"user_style":
"prefer minimal products"
}
```

---

# 6. Stage 3：Intent Understanding


Intent Agent 分析：

用户到底想表达什么。


输出：

```json
{
"intents":[

{
"type":
"Think",

"confidence":
0.92
},


{
"type":
"Plan",

"confidence":
0.86
}

]
}
```

---

说明：

这一句话包含两个行为：

1. 产品思考

2. 工作安排

---

# 7. Stage 4：Entity Extraction


识别：

人、项目、主题。


输出：

```json
{
"entities":[

{
"type":
"Project",

"value":
"Nimbus"
},


{
"type":
"Feature",

"value":
"Classic Edition"
},


{
"type":
"Topic",

"value":
"AI Positioning"
}

]
}
```

---

# 8. Stage 5：Object Generation


这是核心。


AI生成内部对象。


---

## Thought Object


```json
{
"type":
"Insight",

"title":
"Classic should focus on pure email experience",

"project":
"Nimbus"
}
```

---

## Commitment Object


```json
{
"type":
"Commitment",

"title":
"Update Classic homepage positioning",

"time":
"Next Week"
}
```

---

## Memory Candidate


AI判断：

是否可能形成长期原则。


生成：

```json
{
"type":
"Principle Candidate",

"content":
"AI should not dominate product experience",

"confidence":
0.72
}
```

---

# 9. Stage 6：Memory Evaluation


Memory Agent 判断：

这个原则是否保存。


检查：

---

## Historical Evidence


搜索：

过去相关讨论。


发现：

10次。


---

## Scope


影响：

多个产品。


---

## Stability


长期有效。


---

结果：

```json
{
"decision":

"promote_to_memory",

"type":

"Principle",

"confidence":

0.91
}
```

---

# 10. Stage 7：Planning


Commitment进入 Planner。


输入：

```text
Task:

Update homepage


Deadline:

Next week


Project:

Nimbus
```


Planner 查询：

Calendar。


发现：

下周：

星期三下午空闲。


---

生成：

```json
{
"schedule":

{
"date":
"Wednesday",

"time":
"14:30",

"duration":
60
}
}
```

---

# 11. Stage 8：Autonomy Decision


现在决定：

是否直接执行。


评估：

---

任务：

修改个人工作计划。


风险：

低。


可撤销：

高。


---

结果：

```json
{
"action":

"execute",

"confidence":

0.94
}
```

---

直接安排。

---

# 12. Stage 9：Response Generation


不要返回聊天。


生成 Result Card。


---

用户看到：

```
已理解


这是一个产品定位想法。

已保存：

Insight:
Classic 应强调纯邮件体验。


同时安排：

下周三 14:30

调整官网定位。


另外：

我发现这和你之前的原则一致：

AI应该辅助，而不是主导。


[查看]

[调整]

[撤销]

```

---

# 13. Stage 10：Feedback Loop


用户行为：

- 接受
- 修改
- 删除


进入学习。


---

例如：

用户：

取消安排。


系统记录：

```json
{
"feedback":

"user rejected schedule",

"reason":

"prefer mornings"
}
```

---

更新：

Working Pattern。


---

# 14. 完整 Sequence Diagram


```text
User

 |

 | Input

 ↓

Input Agent

 |

 ↓

Context Engine

 |

 ↓

Intent Agent

 |

 ↓

Object Generator

 |

 ├──────── Thought

 |

 ├──────── Commitment

 |

 └──────── Memory Candidate


 |

 ↓

Memory Engine


 |

 ↓

Planning Engine


 |

 ↓

Autonomy Engine


 |

 ↓

Action


 |

 ↓

UI Response


 |

 ↓

User Feedback


 |

 ↓

User Model Update

```

---

# 15. Error Handling

Agent 必须处理失败。

---

## Case 1：

理解不确定。


例如：

> 下个月看看。


处理：

不要创建任务。


保存：

Thought。


---

## Case 2：

多个解释。


例如：

> 做一下那个方案。


可能：

A 修改方案

B 重新设计


处理：

询问。


---

## Case 3：

Memory 冲突。


例如：

以前：

不做移动端。


现在：

做 iOS。


处理：

Conflict。


---

# 16. Runtime 优先级


当资源有限：

优先：

```
Safety

↓

Correct Context

↓

Correct Action

↓

Speed

```

---

不要：

为了快而错误执行。

---

# 17. Background Agent Loop


Agent 不只在用户输入时工作。


后台运行：

---

## Calendar Observer


检测：

日程变化。


---

## Deadline Observer


检测：

风险。


---

## Memory Consolidation


定期整理：

重复 Memory。


---

## Pattern Discovery


发现：

行为模式。


---

# 18. Daily Agent Cycle


每天：

---

## Morning


生成：

Daily Brief。


---

## During Day


动态调整。


---

## Evening


生成：

Reflection。


例如：

```
今天：

完成5项


新增：

3个想法


发现：

一个产品原则
```

---

# 19. Agent Runtime 核心原则


## 1.

所有输入先保存，再理解。


避免信息丢失。


---

## 2.

所有行动必须可解释。


用户知道：

为什么。


---

## 3.

所有长期记忆必须有证据。


避免污染。


---

## 4.

所有自动行为必须可撤销。


建立信任。


---

# 20. 最终 Runtime 定义


Aldus Palace 的运行方式：

不是：

```text
User asks

↓

AI answers
```

而是：

```text
User expresses life/work context

↓

AI builds understanding

↓

AI maintains personal model

↓

AI continuously helps reality move forward
```

---

# 下一部分：

## 15. MVP Feature Specification（第一版产品功能规格）

会把前面的系统压缩成真正可以开发的 V1：

- 第一版具体页面
- 每个功能范围
- 用户故事
- 数据依赖
- Agent 能力要求
- 哪些必须做
- 哪些暂时不要做

这一步会把“宏大系统”变成可以启动开发的产品。