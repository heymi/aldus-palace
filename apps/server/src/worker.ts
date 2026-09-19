import { DurableObject } from "cloudflare:workers";
import {
  createLLMProvider,
  createMessageGuard,
  ensureDevUser,
  initialize,
  localeOf,
  resolvePrivacyLevel,
  resolveProviderConfig,
} from "@aldus-palace/core";
import type { LLMProvider, User } from "@aldus-palace/core";
import { createApp } from "./app.js";
import { DurableObjectDatabase } from "./db/durableObject.js";

export class AldusPalaceBackend extends DurableObject<Env> {
  private readonly db: DurableObjectDatabase;
  private readonly ready: Promise<void>;
  private readonly userConfig: {
    name: string;
    timezone: string;
    language: string;
  };
  private llm!: LLMProvider;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = new DurableObjectDatabase(ctx.storage);
    this.userConfig = {
      name: env.DEV_USER_NAME ?? "Local User",
      timezone: env.DEV_USER_TIMEZONE ?? "UTC",
      language: env.DEV_USER_LANGUAGE ?? "en",
    };
    this.ready = ctx.blockConcurrencyWhile(async () => {
      await initialize(this.db);
      const user: User = await ensureDevUser(this.db, this.userConfig);
      const providerEnv = env as unknown as Record<string, string | undefined>;
      // A cloud provider is only built together with the privacy guard.
      this.llm = createLLMProvider(
        resolveProviderConfig(providerEnv),
        createMessageGuard(this.db, user.id, {
          level: resolvePrivacyLevel(providerEnv),
          locale: localeOf(user.language),
        })
      );
    });
  }

  override async fetch(request: Request): Promise<Response> {
    await this.ready;
    const app = createApp({
      db: this.db,
      llm: this.llm,
      config: {
        devAuthToken: this.env.DEV_AUTH_TOKEN ?? "",
        user: this.userConfig,
        runtime: "cloudflare",
      },
    });
    return app.fetch(request, this.env, {
      waitUntil: (promise) => this.ctx.waitUntil(promise),
      passThroughOnException: () => {},
      props: this.ctx.props,
    });
  }
}

/**
 * The public demo: every visitor gets their own Durable Object, selected by an
 * httpOnly cookie, so one person's captures can never be read by another. The
 * Worker injects the bearer token, so it is not exposed to the browser.
 */
const DEMO_COOKIE = "aldus_demo";
const DEMO_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

function withDemoCookie(response: Response, sid: string): Response {
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    `${DEMO_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DEMO_COOKIE_MAX_AGE}`
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function demoFetch(request: Request, env: Env): Promise<Response> {
  const incoming = new URL(request.url);
  const existing = readCookie(request, DEMO_COOKIE);
  const sid = existing ?? crypto.randomUUID();
  const stub = env.ALDUS_PALACE.get(env.ALDUS_PALACE.idFromName(`demo:${sid}`));

  // The client talks to /api/*; the app is mounted at the root.
  const upstreamUrl = new URL(request.url);
  upstreamUrl.pathname = incoming.pathname.slice("/api".length) || "/";

  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${env.DEV_AUTH_TOKEN ?? ""}`);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstream = new Request(upstreamUrl, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: "manual",
  });

  return withDemoCookie(await stub.fetch(upstream), sid);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // The demo worker has an assets binding: serve the client for everything
    // except /api/*, and isolate each visitor. The production worker has none,
    // so every request (the API is mounted at the root) goes to the DO.
    if (env.ASSETS) {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/api/")) {
        const response = await env.ASSETS.fetch(request);
        // Issue the visitor's session with the document, before its scripts run.
        const isHtml = (response.headers.get("content-type") ?? "").startsWith("text/html");
        if (env.DEMO_MODE === "true" && !readCookie(request, DEMO_COOKIE) && isHtml) {
          return withDemoCookie(response, crypto.randomUUID());
        }
        return response;
      }
      if (env.DEMO_MODE === "true") return demoFetch(request, env);
    }

    const id = env.ALDUS_PALACE.idFromName("primary");
    return env.ALDUS_PALACE.get(id).fetch(request);
  },
} satisfies ExportedHandler<Env>;
