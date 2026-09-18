# Design archive (non-normative)

These are the original Chinese design documents that Aldus Palace was built from:
frozen MVP decisions, the object schema, acceptance scenarios, the engineering
breakdown, and the longer vision/architecture essays.

**They are history, not the spec.** Where they disagree with the code or with
[`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) /
[`docs/DOMAIN-SCHEMA.md`](../DOMAIN-SCHEMA.md), the English docs and the code win.

They are kept because they explain *why* the domain model looks the way it does —
the reasoning is often more useful than the conclusion.

| File | Content |
|---|---|
| `00-MVP-Decisions.md` | scope freeze: what V1 does and explicitly does not do |
| `01-MVP-Object-Schema.md` | the full object schema the DDL derives from |
| `02-MVP-Acceptance-Scenarios.md` | behavioural scenarios (basis of `eval/fixtures`) |
| `03-Engineering-Task-Breakdown.md` | original build order |
| `04-Memory-Cognitive-Map-Foundation.md` | memory/concept foundation |
| `05-LLM-Routing-Effect-First.md` | why understanding prefers the model over cost |
| `6`–`9` | agent behaviour, memory system, planning engine, security architecture |
| `10`, `11` | competitive analysis, growth strategy *(retained privately upstream)* |
| `12`–`15` | implementation blueprint, core intelligence, runtime flow, MVP feature spec |
| `Cognitive_Map_…`, `Object_Model…`, `Agent_Core…`, `UX_Flow…` | vision and design essays |

Translations are not maintained. If you need a normative answer, use the code,
`spec/schema.sql`, and the English docs.
