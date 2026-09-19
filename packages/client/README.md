# @aldus-palace/client

> **One method per route, no runtime dependencies, and a fetch you can replace
> in tests.**

```bash
npm install @aldus-palace/client
```

```ts
import { createClient } from "@aldus-palace/client";

const aldus = createClient({ baseUrl: "http://localhost:8787", token: "dev-local-token" });

const card = await aldus.capture("Ship the onboarding page next week", "local");
console.log(card.action_card.summary);

const today = await aldus.today();
console.log(today.now, today.plan?.core);

// The Action Gate, the trust score, permissions and redaction are all here.
const { items } = await aldus.actions("proposed");
const autonomy = await aldus.autonomy();
const preview = await aldus.redact("Discuss Orvia funding with Zhang", 2, ["Zhang"]);
```

## What it covers

Account and permissions (`me`, `updateMe`, `permissions`, `grantScope`,
`revokeScope`, `redact`, `purge`), capture (`capture`, `input`, `enrich`,
`processInput`, `reclassifyInput`, `resolveClarification`), planning (`today`,
`planToday`, `migrate`, `commitments`, `completeCommitment`, `arrangeToday`,
`removeFromToday`, `dependencies`, `workStreams`), memory (`memories`,
`confirmMemory`, `rejectMemory`, `memoryVersions`), the Action Gate (`actions`,
`decideAction`, `revokeAction`, `autonomy`, `setAutonomyCeiling`) and
`activity`.

Every method returns the parsed JSON the server sends. A non-ok response throws
`AldusApiError` with `status` and `body`.

## Notes

- Node 20 or newer; the global `fetch` is used unless you pass your own.
- The client is a thin transport: the rules live in the server, so the client
  never re-implements a gate.

Apache-2.0.
