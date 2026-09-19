import { AldusApiError, createClient } from "../src/index.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Call = { url: string; method: string; body: unknown; authorization: string | null };

function fakeFetch(response: { status?: number; body?: unknown } = {}) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      authorization: headers.Authorization ?? null,
    });
    return new Response(
      response.body === undefined ? "{}" : JSON.stringify(response.body),
      { status: response.status ?? 200, headers: { "Content-Type": "application/json" } }
    );
  }) as unknown as typeof fetch;
  return { calls, impl };
}

// --- paths, methods and bodies ----------------------------------------------

const { calls, impl } = fakeFetch({ body: { ok: true } });
const client = createClient({ baseUrl: "http://localhost:8787/", token: "t", fetch: impl });

await client.capture("Ship the onboarding page", "local");
assert(calls[0].url === "http://localhost:8787/v1/inputs", `capture path, got ${calls[0].url}`);
assert(calls[0].method === "POST", "capture is a POST");
assert((calls[0].body as { content: string }).content === "Ship the onboarding page", "the content travels");
assert((calls[0].body as { mode: string }).mode === "local", "the mode travels");
assert(calls[0].authorization === "Bearer t", "the token is a bearer header");

await client.today();
assert(calls[1].url === "http://localhost:8787/v1/today", "today path");
assert(calls[1].method === "GET", "today is a GET");

await client.planToday("v1");
assert(calls[2].url === "http://localhost:8787/v1/plan/today", "plan path");
assert((calls[2].body as { plan_version: string }).plan_version === "v1", "the plan version travels");

await client.memories("active");
assert(calls[3].url === "http://localhost:8787/v1/memories?state=active", "memory state filter");

await client.confirmMemory("mem_1", { supersedes: "mem_0", reason: "changed" });
assert(calls[4].url === "http://localhost:8787/v1/memories/mem_1/confirm", "confirm path");
assert((calls[4].body as { supersedes: string }).supersedes === "mem_0", "the supersede travels");

await client.decideAction("act_1", "approve", "looks right");
assert(calls[5].url === "http://localhost:8787/v1/actions/act_1/decide", "decide path");
assert((calls[5].body as { decision: string }).decision === "approve", "the decision travels");

await client.setAutonomyCeiling(3);
assert(calls[6].url === "http://localhost:8787/v1/autonomy", "autonomy path");
assert((calls[6].body as { ceiling: number }).ceiling === 3, "the ceiling travels");

await client.redact("Orvia funding", 2, ["Zhang"]);
assert(calls[7].url === "http://localhost:8787/v1/privacy/redact", "redact path");
assert((calls[7].body as { level: number }).level === 2, "the level travels");

await client.addDependency("c1", "c2");
assert(calls[8].url === "http://localhost:8787/v1/commitments/c1/dependencies", "dependency path");
assert((calls[8].body as { blocked_by_id: string }).blocked_by_id === "c2", "the blocker travels");

await client.removeDependency("c1", "c2");
assert(
  calls[9].url === "http://localhost:8787/v1/commitments/c1/dependencies/c2",
  "dependency removal path"
);
assert(calls[9].method === "DELETE", "removal is a DELETE");

await client.purge();
assert((calls[10].body as { confirm: boolean }).confirm === true, "purge confirms");

// --- errors -----------------------------------------------------------------

const failing = fakeFetch({ status: 404, body: { error: "not_found" } });
const failingClient = createClient({ baseUrl: "http://x", token: "t", fetch: failing.impl });
let caught: unknown;
try {
  await failingClient.decideAction("act_missing", "approve");
} catch (error) {
  caught = error;
}
assert(caught instanceof AldusApiError, "a non-ok response throws AldusApiError");
assert((caught as AldusApiError).status === 404, "the status is preserved");
assert((caught as AldusApiError).message === "not_found", "the error body becomes the message");

const textOnly = (async () =>
  new Response("boom", { status: 500 })) as unknown as typeof fetch;
const textClient = createClient({ baseUrl: "http://x", token: "t", fetch: textOnly });
let textError: unknown;
try {
  await textClient.today();
} catch (error) {
  textError = error;
}
assert(textError instanceof AldusApiError, "a non-JSON error still throws");
assert((textError as AldusApiError).body === "boom", "the raw body is preserved");

console.log("client tests passed.");
