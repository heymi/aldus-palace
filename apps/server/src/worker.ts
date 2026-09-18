import { DurableObject } from "cloudflare:workers";
import {
  createLLMProvider,
  resolveProviderConfig,
  initialize,
} from "@aldus-palace/core";
import type { LLMProvider } from "@aldus-palace/core";
import { createApp } from "./app.js";
import { DurableObjectDatabase } from "./db/durableObject.js";

export class AldusPalaceBackend extends DurableObject<Env> {
  private readonly db: DurableObjectDatabase;
  private readonly ready: Promise<void>;
  private readonly llm: LLMProvider;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = new DurableObjectDatabase(ctx.storage);
    this.llm = createLLMProvider(
      resolveProviderConfig(env as unknown as Record<string, string | undefined>)
    );
    this.ready = ctx.blockConcurrencyWhile(async () => {
      await initialize(this.db);
    });
  }

  override async fetch(request: Request): Promise<Response> {
    await this.ready;
    const app = createApp({
      db: this.db,
      llm: this.llm,
      config: {
        devAuthToken: this.env.DEV_AUTH_TOKEN ?? "",
        user: {
          name: this.env.DEV_USER_NAME ?? "Local User",
          timezone: this.env.DEV_USER_TIMEZONE ?? "UTC",
          language: this.env.DEV_USER_LANGUAGE ?? "en",
        },
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

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const id = env.ALDUS_PALACE.idFromName("primary");
    return env.ALDUS_PALACE.get(id).fetch(request);
  },
} satisfies ExportedHandler<Env>;
