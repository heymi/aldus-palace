/**
 * Minimal end-to-end example.
 *
 *   pnpm --filter @aldus-palace/example-capture-cli start
 *
 * It shows the two things an embedder has to provide:
 *   1. a `SqlDatabase` implementation (here: ~40 lines over better-sqlite3)
 *   2. an `LLMProvider` (here: the deterministic offline one)
 *
 * ...and then runs the capture pipeline:
 *   input → understanding → structured objects → ActionCard
 */

import Database from "better-sqlite3";
import {
  DevLLMProvider,
  applySchema,
  migrate,
  nowIso,
  processRawInput,
  writeActionLog,
  type SqlDatabase,
  type SqlRunResult,
  type SqlStatement,
  type User,
} from "@aldus-palace/core";

class Statement implements SqlStatement {
  constructor(private readonly statement: Database.Statement) {}
  async all(...bindings: unknown[]): Promise<unknown[]> {
    return this.statement.all(...bindings) as unknown[];
  }
  async get(...bindings: unknown[]): Promise<unknown> {
    return this.statement.get(...bindings);
  }
  async run(...bindings: unknown[]): Promise<SqlRunResult> {
    return { changes: this.statement.run(...bindings).changes };
  }
}

class Sqlite implements SqlDatabase {
  constructor(private readonly db: Database.Database) {}
  prepare(query: string): SqlStatement {
    return new Statement(this.db.prepare(query));
  }
  async exec(query: string): Promise<void> {
    this.db.exec(query);
  }
  transaction<T>(callback: () => Promise<T>): () => Promise<T> {
    return async () => {
      this.db.exec("BEGIN");
      try {
        const result = await callback();
        this.db.exec("COMMIT");
        return result;
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    };
  }
}

const db = new Sqlite(new Database(":memory:"));
await applySchema(db);
await migrate(db);

const user: User = {
  id: "user_demo",
  name: "Demo",
  timezone: "Asia/Tokyo",
  language: "en",
  calendar_write_enabled: false,
  created_at: nowIso(),
  updated_at: nowIso(),
};
await db
  .prepare(
    `INSERT INTO users (id, name, timezone, language, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  .run(user.id, user.name, user.timezone, user.language, user.created_at, user.updated_at);

const input = process.argv.slice(2).join(" ") || "Ship the onboarding page next week";

await db
  .prepare(
    `INSERT INTO raw_inputs
     (id, user_id, content, source, processing_status, created_at, updated_at)
     VALUES ('inp_demo', ?, ?, 'text', 'pending', ?, ?)`
  )
  .run(user.id, input, nowIso(), nowIso());

await writeActionLog(db, {
  user_id: user.id,
  actor: "user",
  action_type: "input_captured",
  summary: "captured from example CLI",
});

const card = await processRawInput(db, new DevLLMProvider(), user, "inp_demo", "local");

console.log(`input:  ${input}\n`);
console.log(`summary: ${card.summary}\n`);
console.log(JSON.stringify(card, null, 2));
