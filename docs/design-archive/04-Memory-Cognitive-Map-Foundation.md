# 04. Memory & Cognitive Map Foundation（记忆 / 认知地图基础冻结）

Version: 1.0  
Status: **Frozen for Foundation**  
Parents: `00-MVP-Decisions`, `Cognitive_Map_Architecture_Upgrade_Specification`  
Last Updated: 2026-07-18

---

## 0. 文档地位

本文件冻结 **记忆系统基础层（M0–M5）** 的范围与对象。

- 方向对齐：`Cognitive_Map_Architecture_Upgrade_Specification.md`
- 冲突时：产品硬边界仍服从 `00-MVP-Decisions`；本文件细化 Memory/Concept 子集
- **不做** 可视化图谱、主动洞察、完整 Gravity、Planning 深度冲突（后续 Phase）

---

## 1. 目标

从：

> AI 记住信息

演进为（基础版）：

> AI 开始建立用户认知节点：记忆可确认、可挂概念、可在 Capture 时注入

---

## 2. 与 00 的裁决

| 议题 | 裁决 |
|------|------|
| Identity 作为 Memory.type | **否**（与 00 一致）。身份感用 Concept 或 User 侧表达 |
| Goal 作为 Memory.type | **Foundation 不做**；用 Thought/Commitment/Project 表达 |
| Experience | **可选** Memory.type=`experience`，低优先级 |
| 永久记忆 | **必须确认**：candidate → user confirm → active |
| 静默自动建 Concept 图谱 | 规则可 **get-or-create Concept by name**（节点），不建复杂边 UI |
| Graph View | **不做** |

---

## 3. Memory 类型（Foundation）

```text
preference
principle
project_context
decision
experience   # optional
```

字段（逻辑）：

```text
id, user_id, type, content
status: candidate | active | archived
confidence, importance
source: user_explicit | ai_inferred | decision_promote
evidence
source_input_id, source_decision_id, project_id
confirmed_at
created_at, updated_at
```

---

## 4. Concept（新）

有意义的、可复用的认知节点。

```text
id, user_id
name            # 规范化展示名，如「简洁」「隐私」
normalized_name # lower/trim 唯一键（per user）
description
importance      # 0–1，默认 0.5
last_used_at
created_at, updated_at
```

V1 **不**给 Concept 做复杂 type 枚举（identity/goal 等后置）。

---

## 5. Memory ↔ Concept

表 `memory_concepts`：

```text
memory_id
concept_id
relationship_type   # default: related_to | about
strength             # 0–1
```

一条 Memory 可挂 0–N 个 Concept。

`concept_links`（Concept↔Concept）**Foundation 建表可选，API 可不暴露**。

---

## 6. 形成管线

```text
Input
  → 规则/模型抽取 Memory Candidate（+ 建议 concept names）
  → 用户确认 / 丢弃
  → Active Memory
  → 绑定 Concepts（get-or-create by name）
```

禁止：单次闲聊直接变永久 active。

---

## 7. 检索与注入（Foundation 最小）

Capture / Understand 时：

1. 取用户 **active** memories（上限 12，按 importance/updated 排序）
2. 关键词与当前输入重叠的优先
3. 附带其 linked concepts
4. 注入 LLM/规则上下文（system 旁路文本）

**暂不做** embedding 向量库（预留接口）。

---

## 8. API（最小）

```text
GET    /v1/memories?status=
POST   /v1/memories/:id/confirm   # body: { concept_names?: string[] }
POST   /v1/memories/:id/reject
GET    /v1/concepts
POST   /v1/concepts               # { name, description? }
GET    /v1/concepts/:id           # + linked memories
```

---

## 9. UX

- 侧栏「记忆」：候选 / 已确认，展示类型、证据、关联概念
- Capture Card：记忆候选确认；确认后可显示概念标签
- **不出现**「知识图谱」导航

---

## 10. 成功标准（Foundation）

1. 用户能确认偏好/原则类候选  
2. Active 记忆在下次 Capture 的上下文中被引用（可观察：日志或 action 说明）  
3. 记忆可挂到 Concept，记忆页可见  
4. 无 Graph UI，无 Identity Memory 类型污染  

---

## 11. 明确不做

```text
❌ Graph View
❌ 完整 Relationship Engine UI
❌ Gravity 自动驱动全部排序
❌ Planning 深度冲突引擎
❌ 主动「你最近总是…」洞察推送
❌ 多用户协作知识库
```
