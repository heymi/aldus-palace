# memory-gate-only

The memory gate, on its own — no capture pipeline, no server.

```bash
pnpm --filter @aldus-palace/example-memory-gate-only start
```

It walks one belief through its whole life:

```
confirmed:  “不做移动端，保持 Mac-only”
candidate:  “开始做 iOS 版，下个季度排期”
            ⚠ conflict with “不做移动端，保持 Mac-only” — opposite stance on platform scope
confirmed with replace → the old memory becomes superseded, the new one active
```

Then it prints the state counts and the **version chain**, because the old
belief is still readable.

What you are looking at (and do not have to build yourself):

- memories are candidates until a human confirms them — no threshold auto-promotes
- contradiction detection (rule-based offline, model-assisted when configured)
- replacing an old belief never deletes it: `supersedes_id` / `superseded_by_id`
- everything is recorded in the action log

API: `packages/core/src/services/memoryLifecycle.ts` and `memoryEvolution.ts`.
