# understanding-only

The Understanding Agent, on its own. No server, no MCP, no API key — an
in-memory database and the deterministic provider.

```bash
pnpm --filter @aldus-palace/example-understanding-only start
```

Four inputs, four different decisions, all printed with the reasoning:

| Input | What the runtime decides |
|---|---|
| “帮我规划一下下周三的客户拜访，顺便想想怎么提高转化率” | mixed: a commitment *and* a thought, relative date resolved |
| “最近觉得 AI 产品都太吵了，干扰太多” | thought only — no commitment invented |
| “以后产品不要做太复杂，保持克制” | a **memory candidate**, not an active memory |
| the first sentence repeated | the near-duplicate is **skipped**, not stored twice |

What you are looking at (and do not have to build yourself):

- object-mode exclusivity — one capture cannot become both a thought and the same commitment
- relative date resolution on the server, not in the prompt
- near-duplicate detection across captures
- memory gating with reasons (`low_confidence`, `one_off_creative`, …)

The full pipeline is `packages/core/src/agent/understand.ts`; the gates live in
`lib/`.
