import type { SqlDatabase } from "../db/port.js";
import { nowIso } from "../db/port.js";
import { newId } from "../lib/id.js";

const ENRICHMENT_LEASE_MS = 5 * 60 * 1000;

export async function claimEnrichment(
  db: SqlDatabase,
  inputId: string,
  userId: string,
  at = new Date()
): Promise<string | null> {
  const generationId = newId("gen");
  const claimedAt = at.toISOString();
  const leaseUntil = new Date(
    at.getTime() + ENRICHMENT_LEASE_MS
  ).toISOString();
  const result = await db
    .prepare(
      `UPDATE raw_inputs
       SET processing_status = 'enriching', processing_generation_id = ?,
           processing_lease_until = ?, error_message = NULL, updated_at = ?
       WHERE id = ? AND user_id = ?
         AND (processing_status != 'enriching'
           OR processing_lease_until IS NULL OR processing_lease_until <= ?)`
    )
    .run(generationId, leaseUntil, claimedAt, inputId, userId, claimedAt);
  return result.changes > 0 ? generationId : null;
}

export async function recordEnrichmentFailure(
  db: SqlDatabase,
  inputId: string,
  generationId: string,
  message: string
): Promise<void> {
  await db.prepare(
    `UPDATE raw_inputs
     SET processing_status = 'local', error_message = ?,
         processing_generation_id = NULL, processing_lease_until = NULL,
         updated_at = ?
     WHERE id = ? AND processing_generation_id = ?`
  ).run(message, nowIso(), inputId, generationId);
}
