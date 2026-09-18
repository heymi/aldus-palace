# ADR 0002: Keep Work Classification as a Rebuildable Projection

Date: 2026-07-22
Status: Accepted

## Context

The Work list becomes tiring when many Commitments are rendered as one flat stream. Project-only grouping is insufficient when most work belongs to one product. The product must reduce scanning without turning classification into another system the user manages.

## Decision

Smart Work groups are a replaceable projection over open Commitments.

- Commitment remains the truth source.
- The classifier may use the authoritative `project_id`, Commitment semantics, Project context, and up to three related active Memories in total.
- Memory and linked Concepts are contextual evidence only. Classification never creates or mutates Project, Concept, or Memory.
- A rebuild is an explicit idempotent command with fingerprints, classifier/provider cache keys, a generation, a lease, strict output validation, and an atomic projection plus ActionLog update.
- Reads never call the model. They return the latest projection, then Project or unassigned fallback.
- A manual move to an existing group is a durable override of the projection, not long-term Memory.
- UI presentation stays one level deep, normally 3–5 groups and at most 6. Each group previews three items, with risk, started work, and nearest deadlines exposed first.

## Consequences

- AI or network failure cannot hide or mutate work.
- Group labels may evolve while stable keys and manual overrides prevent unnecessary drift.
- Classification state is intentionally disposable and can be rebuilt after model or prompt changes.
- The system does not learn a permanent user preference from a single correction.

## Migration and rollback

- The additive migration is idempotent and records `2026-07-22-work-classification-v1` only after both projection tables, indexes, and cache-key columns exist.
- Older clients ignore the additional Commitment response fields and continue rendering the flat list.
- Rollback disables the rebuild command and client grouping while leaving the disposable projection tables in place; Commitment, Project, Today, and Memory data require no reverse migration.
