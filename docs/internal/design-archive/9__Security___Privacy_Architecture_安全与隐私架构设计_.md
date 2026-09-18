# 9. Security & Privacy Architecture（安全与隐私架构设计）
# 9. Security & Privacy Architecture（安全与隐私架构设计）

Version: 1.0

---

# 1. 设计目标

这个产品和普通 AI App 最大区别：

它不是处理一次性问题。

它长期接触：

- 用户工作内容
- 日历
- 邮件
- 项目
- 商业决策
- 思考过程
- 人际关系
- 长期习惯

因此：

> 隐私不是一个功能，而是产品基础架构。

---

# 2. 核心安全原则

## Principle 1

## User owns the context

用户拥有自己的：

- Memory
- Thought
- Decision
- Project Context


不是平台资产。

---

## Principle 2

## Minimum Data Exposure

只发送完成任务所需要的数据。


错误：

用户：

> 帮我安排今天计划。


发送：

整个邮箱数据库。


---

正确：

只发送：

```json id="1p7f4x"
{
"calendar_events":
[
"10:00 Meeting"
],

"available_time":
[
"13:00-17:00"
]
}
```

---

## Principle 3

## Local First

能本地处理：

尽量本地。


---

# 3. 数据分类体系

所有数据分级。


---

# Level 0

Public Data


例如：

用户公开信息。


无需保护。


---

# Level 1

Personal Preference


例如：

喜欢简洁设计。


保护：

普通。


---

# Level 2

Work Context


例如：

项目背景。


保护：

高。


---

# Level 3

Sensitive Work Data


例如：

邮件内容。


保护：

非常高。


---

# Level 4

Private Cognitive Data


例如：

- 未公开想法
- 决策过程
- 商业计划
- 长期 Memory


最高级。


---

# 4. 数据流架构

## 推荐架构


``` id="c34xgq"
                 User Device


                     |

              Local Intelligence Layer


                     |

        ┌────────────┴────────────┐

        |                         |

 Local Model              Cloud AI


        |                         |

Private Processing       Complex Reasoning

```


---

# 5. Local Intelligence Layer


运行：

macOS / iOS。


负责：

## 本地任务

- 输入解析
- 简单分类
- Memory索引
- 敏感信息检测
- 日历读取
- 基础规划


---

例如：

用户输入：

> 下周和投资人讨论融资计划。


本地：

识别：

敏感主题。


决定：

不能直接发送完整文本。

---

# 6. Cloud AI Layer


负责：

复杂能力：

- 深度推理
- 长文本分析
- 复杂规划
- 高质量生成


---

但：

必须经过：

Privacy Gateway。


---

# 7. Privacy Gateway


核心安全层。


流程：

``` id="1ovckm"
User Input


↓

Sensitive Detection


↓

Redaction


↓

Permission Check


↓

Cloud AI
```

---

# 8. Data Redaction（脱敏）

例如：

原文：

> 明天和张总讨论 Nimbus 融资。


发送云端：

```
明天和[联系人]讨论[商业事项]
```


---

AI 本地保留：

真实映射。


---

# 9. Memory Storage Design


Memory 是最高敏感数据。


建议：

## Local Encrypted Store


保存：

- Personal Memory
- Thought
- Decision
- Private Context


---

例如：

macOS：

Keychain + Encrypted Database。


iOS：

Secure Enclave + Encrypted Storage。


---

# 10. Cloud Memory Strategy


默认：

不要上传完整 Memory。


---

云端只接收：

Temporary Context。


例如：

用户：

> 帮我写官网。


云端：

收到：

```
Brand:
Minimal

Tone:
Natural

Avoid:
AI hype
```

---

不知道：

完整个人历史。


---

# 11. Permission Model


采用：

渐进式授权。


---

## 第一阶段


用户主动连接：

Calendar。


---

## 第二阶段


询问：

是否连接：

Mail。


---

## 第三阶段


高级：

Files。


---

不要首次启动：

一次要求全部权限。


---

# 12. Permission Scope


权限细粒度。


例如：

Calendar：

允许：

读取事件。


可选：

创建事件。


可选：

修改事件。


---

Mail：

允许：

读取主题。


可选：

读取正文。


可选：

发送邮件。


---

# 13. Memory Permission


特别设计。


三种模式：


## Private

只本地。


---

## Sync

设备间同步。


---

## AI Assist

允许云端处理。


---

默认：

Private。


---

# 14. AI Action Security


AI 可以执行操作。


必须：

Action Gate。


---

流程：

``` id="xxj5jw"
Agent Proposal


↓

Risk Assessment


↓

Permission Check


↓

Execute


↓

Log
```

---

# 15. Action Risk Level


## Low Risk


自动。


例如：

调整任务时间。


---

## Medium Risk


通知。


例如：

创建日历事件。


---

## High Risk


确认。


例如：

发送邮件。


---

## Critical


再次确认。


例如：

付款。


---

# 16. Audit Log


所有 AI 行为记录。


结构：

```json id="u4x4wz"
{
"action":

"Moved task",

"reason":

"Meeting conflict",

"timestamp":

"2026-07-18",

"user_response":

"accepted"
}
```

---

用户可以：

查看。

撤销。

---

# 17. Data Lifecycle


数据生命周期：

``` id="1e1k9w"
Create

↓

Process

↓

Store

↓

Use

↓

Archive

↓

Delete
```

---

# 18. Delete Policy


用户删除：

必须：

真正删除。


包括：

- 本地数据库
- 云同步
- Vector Index
- Backup


---

不能：

“隐藏”。

---

# 19. Export Policy


用户可以导出：

自己的 AI 数据。


格式：

JSON。


例如：

```json id="7y4xql"
{
"thoughts":[],
"memories":[],
"projects":[]
}
```

---

# 20. Multi-device Sync


推荐：

End-to-End Encryption。


架构：

``` id="p7b6qz"
Mac

↓

Encrypted Sync

↓

iPhone
```

---

服务器：

无法读取。


---

# 21. Enterprise Future


未来企业版：

需要：

- Team Isolation
- Admin Control
- Audit
- Data Residency
- SSO


---

# 22. Privacy Product Positioning


隐私不是：

“我们不卖数据”。

太弱。


应该：

## Your AI, Your Memory, Your Data


核心表达：

> 这是你的个人 AI，不是平台的数据资产。

---

# 23. 与普通 AI 产品区别


普通 AI：

```
用户

↓

Cloud

↓

Model

↓

History
```

---

Aldus Palace：

```
用户

↓

Private Personal Layer

↓

Selective Intelligence

↓

User Controlled Memory
```

---

# 24. MVP 安全策略


第一版：

必须：

✅ 本地保存 Memory

✅ 加密数据库

✅ 用户控制删除

✅ 明确云端数据说明

✅ Action Log


---

暂缓：

- 完整 E2E Sync
- 企业权限
- 多租户隔离

---

# 25. 安全架构总结


这个产品最大的资产：

不是任务。

不是模型。

而是：

> 一个长期积累的个人认知模型。


因此安全设计必须保证：

- AI 可以越来越懂用户
- 但用户永远拥有控制权

---

# 下一部分：

## 10. Competitive Analysis & Product Positioning

将分析：

- Things / Todoist
- Notion
- Motion
- Reclaim
- Sunsama
- ChatGPT
- Claude
- Apple Intelligence

并明确：

为什么这个产品不是另一个 AI Todo，而是一种新的 Aldus Palace。