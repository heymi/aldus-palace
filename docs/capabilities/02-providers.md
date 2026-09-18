# 2. Providers

> **Your agent has never run in CI. That's why it breaks on Friday night.**

**The moment.** Someone swaps the model and forty call sites need editing.
Nobody can test the extraction logic without burning tokens, so it is tested by
hand, occasionally. An upstream outage takes the whole feature down instead of
degrading it.

**What you get.** A nine-line interface, three implementations, and a runtime
that never reads `process.env` behind your back:

```ts
interface LLMProvider {
  readonly name: string;
  complete(messages: ChatMessage[], options?: { json?: boolean }): Promise<string>;
}
```

| Provider | Notes |
|---|---|
| `DevLLMProvider` | deterministic rules; **no network, no key** — the reason `pnpm test` works |
| `OpenAICompatibleProvider` | DeepSeek, OpenAI, a gateway, a local server |
| `AnthropicProvider` | Messages API — `system` hoisting, message normalisation, in-band JSON |

Configuration is resolved by `resolveProviderConfig({ … })` and passed in
explicitly, so you can construct as many providers as you like — one per tenant,
one fake per test.

**Who this is for.** Teams with an agent in production and no way to regression-test it.

## See it in 30 seconds

```bash
pnpm test     # eleven suites, zero keys, offline
```

The deterministic provider is what makes the pipeline reproducible: the same
input yields the same objects, so tests assert behaviour instead of vibes.

## Use it as

- **Library** — `@aldus-palace/core/providers`

```ts
import { DevLLMProvider, createLLMProvider, resolveProviderConfig } from "@aldus-palace/core/providers";

const offline = new DevLLMProvider();
const live = createLLMProvider(resolveProviderConfig(process.env));
```

`LLM_PROVIDER=auto` (default) prefers Anthropic, then any OpenAI-compatible key,
and falls back to the deterministic provider when no key is configured — so a
clone always runs.

## Proof

- `packages/core/src/providers/` — interface + three implementations
- `packages/core/test/providers.test.ts` — request shaping is asserted with a stubbed `fetch`
- `packages/mcp/test/tools.test.ts` — the whole tool surface runs on the offline provider
