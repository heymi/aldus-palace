

重点不是重新设计产品，而是：

> 在保持原 Aldus Palace 方向不变的情况下，将 Memory Engine 升级为 Cognitive Map Engine，并同步调整数据模型、Agent 架构和检索机制。

---

```markdown
# Cognitive Map Architecture Upgrade Specification
# Cognitive Map Architecture Upgrade Specification

Version: 1.0

---

# 0. Purpose of This Document

This document describes an architectural evolution of the existing Personal AI Operating System design.

The original architecture focused on:

- Task understanding
- Memory storage
- Planning
- Personal context

This upgrade introduces:

# Cognitive Map Engine

The purpose is to evolve the system from:

"AI that remembers information"

into:

"AI that understands the user's cognitive structure."

---

# 1. Core Concept Change

## Before

Memory Model:

```
User

↓

Memory

↓

Retrieve Information
```

The AI stores useful information.

---

## After

Cognitive Map Model:

```
User

↓

Cognitive Map

↓

Concepts

↓

Relationships

↓

Decisions

↓

Actions
```

The AI understands:

- What matters to the user
- Why something matters
- How ideas connect
- How decisions evolved

---

# 2. New Product Definition

The product should be considered:

## Personal Cognitive Operating System

Not only:

- Task Manager
- Note App
- Calendar Assistant

But:

A system that models:

- User identity
- Goals
- Principles
- Projects
- Thoughts
- Decisions
- Experiences

and uses this model to assist future actions.

---

# 3. Architecture Update

Previous:

```
User Model

↓

Memory Engine

↓

Planning Engine
```

New:

```
                         User Model


                              ↑


                  Cognitive Map Engine


                              ↑


 ┌──────────────┬──────────────┬──────────────┐

 Thought       Memory          Relationship

 Engine        Engine          Engine


 └──────────────┴──────────────┴──────────────┘


                              ↓


                   Work Intelligence


                              ↓


                    Planning Engine

```

---

# 4. Cognitive Map Core Principles


## Principle 1

Information is not stored independently.

Every important object should have:

- Context
- Relationships
- Evidence
- History


---

## Principle 2

Relationships are as important as objects.


Example:

The system should not only know:

```
User likes simplicity
```

It should know:

```
Simplicity

connected to:

- Nimbus
- SkinCast
- NoteLab

because:

multiple product decisions followed this principle
```

---

## Principle 3

The AI should navigate context, not search documents.

---

# 5. New Core Object: Concept

Add a new domain object:

```
Concept
```

A Concept represents a meaningful idea in the user's cognitive space.


Examples:

```
Simplicity

Privacy

AI Assistance

Native Experience

Growth

Product Quality

```

---

# 6. Updated Domain Model


Previous:

```
User

Project

Thought

Commitment

Memory

Decision

Event

```

---

New:

```
User


├── Cognitive Map
│
├── Concept
│
├── Goal
│
├── Principle
│
├── Preference
│
├── Project
│
├── Thought
│
├── Decision
│
├── Commitment
│
├── Relationship
│
├── Experience
│
└── Event

```

---

# 7. Concept Object Specification


## Concept

Represents a recurring meaningful idea.


Example:

```
Concept:

Simplicity
```


Schema:

```json
{
"id":

"name":

"description":

"importance":

"created_at":

"last_used_at":

}
```

---

# 8. Concept Relationship Model


Concepts are connected through edges.


Example:


```
Simplicity

↓

Principle

↓

Nimbus

↓

Decision

↓

Remove AI Chat Feature

```

---

Relationship schema:

```json
{
"source":

"target":

"type":

"strength":

"evidence":

}
```

---

Relationship types:


```
supports

contradicts

derived_from

influences

belongs_to

related_to

```

---

# 9. Memory System Upgrade


Memory is no longer a standalone storage layer.


Memory becomes:

A cognitive node inside the Cognitive Map.

---

Before:

```
Memory

content
```

---

After:

```
Memory

content

+

Concept Links

+

Evidence

+

History

+

Importance

+

Confidence

```

---

# 10. New Memory Types


Replace previous fragmented categories.

Recommended V1 types:


## Identity

Who the user is.


Example:

Founder.


---

## Goal

Where the user wants to go.


Example:

Build global software products.


---

## Principle

What the user believes.


Example:

AI should assist, not dominate.


---

## Preference

What the user likes.


Example:

Prefer minimal interfaces.


---

## Project Context

Background of projects.


Example:

Nimbus is a privacy-focused native email client.


---

## Decision

Why something was chosen.


Example:

Keep macOS-only.


---

## Experience

Important historical events.


Example:

Users disliked aggressive AI features.


---

# 11. Memory Formation Update


Memory creation should follow:


```
Raw Experience

↓

Observation

↓

Pattern Detection

↓

Memory Candidate

↓

User Confirmation

↓

Active Memory

```

---

Do NOT directly convert:

single input

↓

permanent memory

---

# 12. Cognitive Gravity


Each Concept and Memory should have importance.


Formula:


```
Gravity =

Importance

×

Connection Count

×

Frequency

×

Future Relevance

```

---

High gravity concepts:

- influence many decisions
- appear across projects
- represent stable principles


---

# 13. Retrieval Architecture Upgrade


Previous:

Vector Search


```
Query

↓

Embedding Search

↓

Memory Result

```

---

New:

Cognitive Navigation


```
Query

↓

Identify Relevant Concept

↓

Navigate Cognitive Map

↓

Collect Related Context

↓

Generate Answer

```

---

Example:


User:

"Should we add AI chat to Nimbus?"


System:


Navigate:

```
Nimbus

↓

AI Positioning

↓

Previous Decisions

↓

User Principles

↓

User Feedback

```

---

# 14. Context Assembly Upgrade


LLM context should include:


```
Current Request


+

Relevant Concepts


+

Related Principles


+

Project Context


+

Previous Decisions


+

User Preferences


+

Recent Experiences

```

---

Do not provide:

all memories.

---

# 15. Planning Engine Integration


Planning should consume Cognitive Map.


Example:


Task:

"Add AI chatbot"


Planner checks:


```
Current Goal

+

Product Principles

+

Previous Decisions

+

User Preferences

```

---

Possible output:


"This action may conflict with previous product principles."


---

# 16. Agent Behavior Update


Agents should understand:


## Thought Agent

Creates:

- Thoughts
- Concepts


---

## Memory Agent

Creates:

- Memory Candidates
- Relationships


---

## Planning Agent

Uses:

- Cognitive Context


---

## Trust Agent

Explains:

why decisions are made.


---

# 17. Database Update


Add:


## concepts table


```
id

name

description

importance

created_at

```


---

## concept_links table


```
id

source_id

target_id

relationship_type

strength

evidence

```


---

## memories table update


Add:


```
confidence

importance

evidence

concept_ids

status

```

---

# 18. MVP Scope Adjustment


Do NOT implement a visual knowledge graph.


The Cognitive Map is an internal intelligence layer.


---

MVP should only support:


```
Concept Creation

Concept Linking

Memory Retrieval

Evidence Tracking

```

---

# 19. UX Impact


Do not expose:

"Graph View"


Avoid becoming another knowledge management tool.


---

Expose through:


## Memory Insight


Example:

"You have consistently prioritized simplicity across three products."


---

## Decision Explanation


Example:

"This recommendation matches your previous product principles."


---

# 20. Migration From Existing Architecture


Existing:

```
Memory Engine
```

Upgrade:

```
Cognitive Map Engine

    +

Memory Layer

```

---

Existing:

```
Memory

content
```

Upgrade:

```
Memory

content

+

Concept

+

Relationship

+

Evidence

```

---

# 21. Implementation Priority


Phase 1:

Add Concept model.


Phase 2:

Link Memory with Concepts.


Phase 3:

Improve Retrieval.


Phase 4:

Use Cognitive Context in Planning.


Phase 5:

Enable proactive insights.


---

# 22. Final Architecture Principle


The goal is not:

"Store more information."


The goal is:


"Build a continuously evolving model of how this person thinks."

---

The product should become:

A Personal Cognitive Operating System.
```

---

这份文档建议放在原来的：

```
docs/
```

