import "dotenv/config";
import { openLocalDb } from "./local.js";

const db = await openLocalDb();
const applied = (await db
  .prepare("SELECT version FROM schema_migrations ORDER BY version")
  .all()) as Array<{ version: string }>;

console.log("Schema applied.");
console.log(`Migrations recorded: ${applied.length}`);
for (const row of applied) console.log(`  - ${row.version}`);
