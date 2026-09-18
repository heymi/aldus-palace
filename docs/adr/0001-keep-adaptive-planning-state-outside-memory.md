---
status: accepted
---

# Keep adaptive planning state outside declarative Memory

Recent completion, scheduling, and recommendation-response behavior may silently tune low-risk, reversible planning parameters through an adaptive planning profile. These signals must not create or activate a declarative Memory: confirmed Memory remains reserved for user-recognizable preferences and principles, while planner adaptation stays evidence-backed, decays with behavior, remains auditable, and never overrides explicit user scheduling.

## Consequences

The profile must contain only operational planning parameters and evidence timestamps, must be resettable, and must not appear in the Memory UI. Planner decisions that use it remain explainable through ActionLog reasons without prompting the user to confirm each adjustment.
