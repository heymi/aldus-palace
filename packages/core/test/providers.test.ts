import {
  AnthropicProvider,
  DevLLMProvider,
  OpenAICompatibleProvider,
  ProviderConfigError,
  createLLMProvider,
  isPrivacyGuarded,
  resolveProviderConfig,
  type ChatMessage,
} from "../src/providers/index.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// --- config resolution -----------------------------------------------------

assert(resolveProviderConfig({}).kind === "dev", "no keys ⇒ offline dev");
assert(
  resolveProviderConfig({ LLM_PROVIDER: "dev", ANTHROPIC_API_KEY: "k" }).kind === "dev",
  "explicit dev wins over a present key"
);
assert(
  resolveProviderConfig({ ANTHROPIC_API_KEY: "k" }).kind === "anthropic",
  "auto prefers anthropic when its key is present"
);
assert(
  resolveProviderConfig({ DEEPSEEK_API_KEY: "k" }).kind === "deepseek",
  "auto falls back to an OpenAI-compatible key"
);
assert(
  resolveProviderConfig({ LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" }).kind ===
    "anthropic",
  "explicit anthropic"
);
assert(
  resolveProviderConfig({ LLM_PROVIDER: "anthropic" }).kind === "dev",
  "anthropic without a key degrades to offline dev"
);

const dev = createLLMProvider({ kind: "dev" });
assert(dev.name === "dev", "dev provider keeps its name");

let threw = false;
try {
  createLLMProvider({ kind: "anthropic", log: () => {} });
} catch (error) {
  threw = error instanceof ProviderConfigError;
}
assert(threw, "createLLMProvider must reject a half-configured provider");

let guardRequired = false;
try {
  createLLMProvider({ kind: "anthropic", apiKey: "k", model: "m", log: () => {} });
} catch (error) {
  guardRequired =
    error instanceof ProviderConfigError && /privacy guard/.test(error.message);
}
assert(guardRequired, "a cloud provider without a guard is refused");

const passThrough = async (messages: ChatMessage[]): Promise<ChatMessage[]> => messages;
const guardedCloud = createLLMProvider(
  { kind: "anthropic", apiKey: "k", model: "m", log: () => {} },
  passThrough
);
assert(isPrivacyGuarded(guardedCloud), "a cloud provider built with a guard is branded");
assert(!isPrivacyGuarded(dev), "the dev provider never needs a guard");

// --- request shaping (fetch is stubbed; no network) -------------------------

const calls: Array<{ url: string; init: RequestInit }> = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  calls.push({ url: String(url), init: init ?? {} });
  const body = String(init?.body ?? "");
  if (String(url).includes("/v1/messages")) {
    return new Response(
      JSON.stringify({ content: [{ type: "text", text: '{"ok":true}' }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
  void body;
  return new Response(
    JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}) as typeof fetch;

try {
  const anthropic = new AnthropicProvider({ apiKey: "sk-ant", model: "claude-sonnet-4-5" });
  const text = await anthropic.complete(
    [
      { role: "system", content: "SYSTEM RULES" },
      { role: "user", content: "hello" },
    ],
    { json: true }
  );
  assert(text === '{"ok":true}', "anthropic response is unwrapped");

  const call = calls.at(-1)!;
  assert(call.url.endsWith("/v1/messages"), `anthropic endpoint: ${call.url}`);
  const headers = call.init.headers as Record<string, string>;
  assert(headers["x-api-key"] === "sk-ant", "anthropic uses x-api-key");
  assert(headers["anthropic-version"] === "2023-06-01", "anthropic version header");

  const payload = JSON.parse(String(call.init.body)) as {
    system?: string;
    messages: Array<{ role: string; content: string }>;
    max_tokens: number;
  };
  assert(
    payload.system?.includes("SYSTEM RULES") === true &&
      payload.system?.includes("JSON") === true,
    "system is hoisted and the JSON instruction is appended"
  );
  assert(
    payload.messages.length === 1 && payload.messages[0]!.role === "user",
    "system turns are not sent inside messages"
  );
  assert(payload.max_tokens > 0, "max_tokens is always sent");

  const compatible = new OpenAICompatibleProvider({
    apiKey: "k",
    baseUrl: "https://api.deepseek.com/",
    model: "deepseek-chat",
  });
  assert(compatible.name === "openai-compatible", "default display name");
  await compatible.complete([{ role: "user", content: "hi" }], { json: true });
  const compatCall = calls.at(-1)!;
  assert(
    compatCall.url === "https://api.deepseek.com/v1/chat/completions",
    `trailing slash is normalised: ${compatCall.url}`
  );
  const compatPayload = JSON.parse(String(compatCall.init.body)) as {
    response_format?: { type: string };
  };
  assert(
    compatPayload.response_format?.type === "json_object",
    "OpenAI-compatible providers use response_format"
  );

  // A provider that fails must surface the status and body.
  globalThis.fetch = (async () =>
    new Response("nope", { status: 429 })) as typeof fetch;
  let failedStatus = "";
  try {
    await compatible.complete([{ role: "user", content: "hi" }]);
  } catch (error) {
    failedStatus = error instanceof Error ? error.message : "";
  }
  assert(failedStatus.includes("429"), `error carries status: ${failedStatus}`);
} finally {
  globalThis.fetch = originalFetch;
}

assert(new DevLLMProvider().name === "dev", "dev provider still constructible");

console.log("provider tests passed.");
