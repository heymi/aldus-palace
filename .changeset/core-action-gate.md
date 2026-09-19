---
"@aldus-palace/core": minor
---

Add the Action Gate: `assessActionRisk`, `proposeAction`, `decideAction`,
`revokeAction`, `listActionProposals` and `runGatedAction`. Low-risk actions run,
medium-risk actions run and are recorded, high-risk actions wait for one
approval and critical actions need two. Every proposal, decision and revocation
writes an action-log entry. ADR 0005.
