import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware, type AppVariables } from "./middleware/auth.js";
import { createInputsRoutes } from "./routes/inputs.js";
import { createListRoutes } from "./routes/lists.js";
import type { AppDeps } from "./context.js";

export function createApp(deps: AppDeps): Hono<{ Variables: AppVariables }> {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use(
    "*",
    cors({
      origin: "*",
      allowHeaders: ["Content-Type", "Authorization", "X-API-Token"],
    })
  );

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "aldus-palace-api",
      runtime: deps.config.runtime ?? "local",
      llm: deps.llm.name,
    })
  );

  app.use("/v1/*", authMiddleware(deps));
  app.route("/v1/inputs", createInputsRoutes(deps));
  app.route("/v1", createListRoutes(deps));

  return app;
}
