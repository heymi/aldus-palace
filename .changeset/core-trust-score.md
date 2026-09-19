---
"@aldus-palace/core": minor
---

Add the trust score and autonomy levels: `computeTrustScore`,
`autonomyLevelFor`, `effectiveStatusFor` and `getAutonomyState`. Trust is the
Laplace-smoothed approval rate of decided actions; a level passed to
`proposeAction` widens what runs without asking. `formatActionProposals` takes
an optional autonomy footer. ADR 0006.
