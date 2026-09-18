import type { Context, Next } from "hono";
import { ensureDevUser, getUserById } from "@aldus-palace/core";
import type { SqlDatabase, User } from "@aldus-palace/core";
import type { AppDeps } from "../context.js";

export type AppVariables = {
  user: User;
};

export function authMiddleware(deps: AppDeps) {
  return async function auth(c: Context, next: Next) {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ")
      ? header.slice("Bearer ".length).trim()
      : c.req.header("x-api-token")?.trim();

    const expected = deps.config.devAuthToken?.trim();
    if (!expected) {
      console.error("[auth] DEV_AUTH_TOKEN is not configured");
      return c.json({ error: "service_misconfigured" }, 503);
    }
    if (!token || token !== expected) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const user = await ensureDevUser(deps.db, deps.config.user);
    c.set("user", user);
    await next();
  };
}

export async function requireUser(
  c: Context,
  db: SqlDatabase
): Promise<User> {
  const user = c.get("user") as User | undefined;
  if (!user) throw new Error("user missing");
  return (await getUserById(db, user.id)) ?? user;
}
