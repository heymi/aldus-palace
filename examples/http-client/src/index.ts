/**
 * Drive Aldus Palace over HTTP.
 *
 *   ALDUS_PALACE_API_URL=http://127.0.0.1:8787 \
 *   ALDUS_PALACE_API_TOKEN=dev-local-token \
 *   pnpm --filter @aldus-palace/example-http-client start "Ship the onboarding page next week"
 *
 * The same capabilities as the library, without linking the code: useful when
 * your client is not JavaScript, or when one server serves several apps.
 */

const baseUrl = (process.env.ALDUS_PALACE_API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const token = process.env.ALDUS_PALACE_API_TOKEN ?? "dev-local-token";
const content =
  process.argv.slice(2).join(" ") || "Ship the onboarding page next week";

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

const health = await call<{ ok: boolean; service: string; llm: string }>("/health");
console.log(`▸ ${health.service} (llm: ${health.llm})`);

const captured = await call<{
  id: string;
  processing_status: string;
  action_card: { summary: string; commitments: unknown[] };
}>("/v1/inputs", { method: "POST", body: { content, mode: "sync" } });

console.log(`\n▸ captured “${content}”`);
console.log(`  ${captured.action_card.summary}`);
console.log(`  commitments: ${captured.action_card.commitments.length}`);

const today = await call<{ date_key: string; unscheduled: unknown[]; risks: unknown[] }>("/v1/today");
console.log(`\n▸ today ${today.date_key}: ${today.unscheduled.length} unscheduled, ${today.risks.length} at risk`);

const streams = await call<{ groups: Array<{ label: string; total: number }> }>("/v1/work-streams");
console.log(`▸ work streams: ${streams.groups.map((g) => `${g.label}(${g.total})`).join(", ") || "none"}`);

console.log("\nOther endpoints worth knowing:");
for (const line of [
  "GET  /v1/commitments?status=planned",
  "GET  /v1/memories?state=candidate",
  "POST /v1/memories/:id/confirm   { supersedes?: string }",
  "GET  /v1/memories/:id/versions",
  "POST /v1/plan/today",
]) {
  console.log(`  ${line}`);
}
