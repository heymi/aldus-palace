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

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const id = env.ALDUS_PALACE.idFromName("primary");
    return env.ALDUS_PALACE.get(id).fetch(request);
  },
} satisfies ExportedHandler<Env>;
