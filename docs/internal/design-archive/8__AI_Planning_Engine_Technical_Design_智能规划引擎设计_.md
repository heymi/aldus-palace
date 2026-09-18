# 8. AI Planning Engine Technical Design（智能规划引擎设计）
# 8. AI Planning Engine Technical Design（智能规划引擎设计）

Version: 1.0

---

# 1. Planning Engine 定位

Planning Engine 是整个系统从“理解用户”到“帮助用户完成事情”的核心。

Memory 负责：

> 我是谁，我过去怎么做。

Thought 负责：

> 我想到什么。

Work Engine 负责：

> 我要完成什么。

Planning Engine 负责：

> 在现实世界中，什么时候、以什么顺序，让这些事情发生。


---

# 2. Planning Engine 的核心目标

不是生成一个漂亮日程表。

而是：

> 在不断变化的现实环境中，让重要事情以最低认知成本完成。

---

传统 Calendar：

```
用户输入

↓

固定时间块

↓

冲突

↓

用户手动调整
```

---

AI Planning：

```
目标

↓

约束

↓

资源

↓

动态安排

↓

持续调整
```

---

# 3. Planning 输入模型

Planning Engine 不直接处理 Task。

它处理：

## Commitment


输入：

```json
{
 "commitment": "完成官网调整",

 "goal": "提高发布转化",

 "deadline": "Friday",

 "duration": 90,

 "flexibility": "high",

 "importance": 0.8,

 "dependencies": []
}
```

---

同时读取：

## Calendar

```text
已有事件

会议
电话
预约
```

---

## User Model

```text
工作习惯：

上午适合创造

下午适合沟通
```

---

## Current State

```text
今天剩余时间

精力

环境
```

---

# 4. Planning Pipeline

完整流程：

```
Commitments

↓

Constraint Analysis

↓

Priority Calculation

↓

Time Window Generation

↓

Schedule Optimization

↓

Conflict Resolution

↓

Execution Monitoring

↓

Replanning
```

---

# 5. Constraint Analysis（约束分析）

每个事项首先拆约束。

---

## Hard Constraint

不可违反。


例如：

```
会议：

7月20日 15:00
```

---

## Soft Constraint

尽量满足。


例如：

```
最好上午完成
```

---

## Preference Constraint

用户习惯。


例如：

```
不要晚上安排创造任务
```

---

## Dependency Constraint

依赖关系。


例如：

```
设计完成

↓

开发开始
```

---

# 6. Priority Engine（优先级计算）


取消人工 Priority。


使用动态评分。


---

公式：

```
Priority Score

=

Impact

×

Urgency

×

Dependency

×

User Goal Alignment

×

Risk

```


---

## Impact

影响。


例如：

发布阻塞：

高。


---

## Urgency

距离截止时间。


---

## Dependency

是否阻塞别人。


---

## Goal Alignment

是否符合长期目标。


---

## Risk

失败成本。


---

# 7. 示例


三个事项：


## A

修改官网

Deadline：

2天后


Impact：

高


---

## B

整理照片

无截止


Impact：

低


---

## C

回复客户


阻塞合作


---

计算：

```
C

↓

A

↓

B
```

---

虽然 A 是大任务。

但是 C 更优先。

---

# 8. Duration Estimation（耗时预测）


AI 不应该完全相信用户。


例如：

用户：

> 修改一下官网。


AI：

根据历史：

发现：

类似任务平均：

90分钟。


---

模型：

```
Estimated Duration

=

User Estimate

+

Historical Similar Tasks

+

Complexity

```

---

# 9. Time Window Generation


不是直接放时间。


先生成可执行窗口。


例如：

任务：

写方案。


条件：

- 本周完成
- 需要连续60分钟
- 上午更佳


生成：

```
候选窗口：

周二 09:30

周三 10:00

周四 14:00
```

---

# 10. Schedule Optimization


目标：

最大化：

```
完成重要事情

+

减少切换

+

符合用户节奏

+

降低压力
```

---

考虑：

## Context Switching Cost

切换成本。


例如：

连续：

写代码

↓

会议

↓

写文档


效率低。


---

AI 优先：

```
上午：

创造工作


下午：

沟通工作
```

---

# 11. Day Planning Algorithm


每天早晨：

运行。


输入：

```
Today's Commitments

Calendar

Energy Pattern
```

---

输出：

```
Today Plan
```

---

示例：

原始：

```
8个任务
```

AI：

整理：

```
核心：

3个


可选：

2个


延期：

3个
```

---

# 12. Now Selection Algorithm


首页 Now 不显示最高优先级任务。


而是：

当前最佳行动。


---

计算：

```
Now Score

=

Priority

×

Available Time

×

Energy Match

×

Context Match
```

---

例如：

现在只有20分钟。


不会推荐：

写商业计划。


推荐：

回复3封邮件。

---

# 13. Dynamic Replanning（动态重排）

这是区别传统软件的关键。


触发：

- 会议延期
- 新任务加入
- 用户提前完成
- 用户状态变化


---

流程：

```
Event

↓

Detect Impact

↓

Recalculate

↓

Update Schedule

↓

Notify if Needed
```

---

# 14. 示例：计划被打乱


原计划：

```
14:00

官网修改


15:30

客户电话
```

---

实际：

会议延长。


AI：

重新计算。


结果：

```
16:00

官网修改


18:00

客户跟进
```

---

无需显示：

Delay。


---

# 15. Buffer Management（缓冲管理）


现实工作永远会延期。


不能排满100%。


---

规则：

每天：

保留：

20%-30% 空间。


---

例如：

8小时工作。


计划：

5.5小时。


剩余：

处理变化。


---

# 16. Task Migration（任务迁移）


任务移动规则。


---

## 自动迁移

满足：

- Flexible
- 未开始
- 有未来窗口


---

## 需要确认

例如：

连续延期3次。


AI：

```
这个任务已经移动3次。

是否：

继续保留？

重新定义？

删除？
```

---

# 17. 循环任务 Planning


循环事项不是复制。


Planner读取：

Recurring Rule。


---

例如：

每周总结。


规则：

```
Frequency:

Weekly


Window:

Friday afternoon


Miss:

Cover
```

---

生成：

当前周期实例。

---

# 18. Event Trigger Planning


支持：

事件驱动。


例如：

```
收到客户回复

↓

等待1天

↓

生成跟进任务
```

---

模型：

```
Trigger

↓

Delay

↓

Action

↓

Deadline
```

---

# 19. Dependency Graph


任务不是列表。


是关系。


例如：

```
产品发布

 |

 ├── 完成测试

 |

 ├── 准备截图

 |

 └── 写公告
```


---

Planner 使用 Graph：

发现：

哪个节点阻塞最大。


---

# 20. Risk Detection


Planning Engine 不只是安排。


还预测失败。


---

风险：

```
Deadline

+

Remaining Work

+

Available Time

```

---

例如：

```
发布还有2天

剩余工作8小时

可用时间4小时


Risk:

High
```

---

提醒：

不是：

“你有任务没完成”。


而是：

“当前计划不可行。”

---

# 21. User Override


用户永远可以：

```
今天不要安排工作

这个任务优先

不要晚上提醒

这个事情延期
```

---

这些成为：

Preference。


---

# 22. Planning Feedback Loop


完成后：

记录：

```
Estimated:

60min


Actual:

120min
```

---

更新：

未来预测。


---

例如：

AI学习：

用户：

写文档通常需要2倍时间。


以后：

自动增加 Buffer。


---

# 23. Planning Engine 数据依赖


需要：

```
Commitment

+

Calendar

+

User Model

+

Memory

+

History
```

---

# 24. MVP Planning 能力


第一版：

必须有：

✅ Deadline理解

✅ Calendar空闲检测

✅ 自动安排

✅ Today Plan

✅ 手动调整反馈


---

暂缓：

- 复杂优化算法
- 多人协作
- 企业资源调度


---

# 25. 高级版本


未来：

## Personal COO


能力：

主动：

- 调整战略优先级
- 发现项目风险
- 推荐停止事项
- 预测时间不足


---

例如：

> 你当前同时推进5个项目，根据过去行为，超过3个并行项目时完成率下降。建议暂停其中两个。


---

# 26. Planning Engine 最终目标


不是：

帮用户排日程。


而是：

> 在不断变化的现实中，让用户不用维护计划，也能持续推进重要目标。


---

# 下一部分：

## 9. Security & Privacy Architecture

这个产品会处理：

- 邮件
- 日历
- 工作内容
- 个人决策
- 长期记忆

隐私架构会直接决定产品定位。

下一部分将设计：

- Local First 架构
- 云端 AI 数据流
- Memory 加密
- 权限模型
- 数据隔离
- 企业级安全策略
- 为什么隐私可以成为核心卖点。