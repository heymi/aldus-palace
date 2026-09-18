# 05. LLM Routing — Effect First（体验优先）

Version: 1.0  
Status: Active  
Last Updated: 2026-07-18

---

## 产品立场

**暂时不以成本为第一约束**（DeepSeek 等足够便宜）。

排序：

```text
用户体验与理解效果
  → 正确性 / 可解释 / 可回退
  → 成本（次要）
```

---

## 总原则

1. **原文神圣**：`raw_inputs` 完整保留；模型只写衍生理解字段。  
2. **模型提案，本地裁决**：校验失败 → 本地 `makeThoughtSummary` / 规则抽取。  
3. **有 Key 就优先走模型**做理解与结构化；`dev` 仅离线/无 Key/失败兜底。  
4. **任务（承诺）也可用模型**做意图与标题——不要求「长文」才调用。  
5. **长文不是唯一开关**；短句若含指代、混合意图，同样应用模型。

---

## 路由

| 条件 | 行为 |
|------|------|
| `LLM_PROVIDER=dev` 或无 API Key | 全本地 |
| `LLM_PROVIDER=deepseek`（或 auto + 有 Key） | **理解与对象抽取走模型** |
| 模型超时 / JSON 坏 / 校验失败 | **回退本地**，不挡 Capture |

「长文」仅作 **产品说明**（本地模板更吃力），**不是**调用门槛。

---

## 模型输入

- **完整原文**（非本地裁切稿）  
- **必带**：用户 Projects 卡片（name + description + aliases）— 迁移案例时做 **品类接地**  
- 可选：active memories、concepts  

### 迁移学习硬规则（体验关键）

外部案例（如 ScanPro）→ 应用到自己的产品（如 Nimbus）时：

- 可抽象 **机制**（一产品多叙事/多列表页）  
- **禁止**把案例产品的客群原样套到目标产品  
- 受众与卖点必须符合目标产品 **品类与已有描述**  
  - Nimbus = native email / 邮件客户端 → 邮件使用场景与痛点  
  - Lumen = 照片/相册 → 相册、边框、滤镜等  
- 画像不足时写「待验证」，不要编造无关垂直行业  

---

## 模型输出（衍生）

- thoughts[].title / content（系统理解）/ type  
- commitments[]  
- memory_candidates[]（仍须用户确认）  

---

## 本地仍负责

- Memory 门禁、时间歧义确认、类型白名单  
- 校验模型摘要（空、过短、复读全文超阈值等）  
- fallback 摘要与 dev 抽取  

---

## 配置

```bash
LLM_PROVIDER=deepseek   # 或 auto：有 Key 则 deepseek
DEEPSEEK_API_KEY=...
# 可选
LLM_EFFECT_FIRST=true   # 默认 true：不因短文跳过模型
```
