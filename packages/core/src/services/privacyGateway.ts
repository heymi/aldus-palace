/**
 * The Privacy Gateway.
 *
 * Every cloud call can pass through here first: sensitive detection, redaction,
 * permission check. What leaves is the minimum, and the mapping stays local.
 * Level 4 data does not leave at all.
 */

import type { SqlDatabase } from "../db/port.js";
import { actionSummary } from "../lib/actionMessages.js";
import type { Locale } from "../lib/locale.js";
import { redactText, type RedactionOptions } from "../lib/redaction.js";
import { writeActionLog } from "../repos/actionLogs.js";

export type DataLevel = 0 | 1 | 2 | 3 | 4;

export type CloudPayload = {
  /** False when the data must stay local. */
  allowed: boolean;
  /** What would be sent. */
  text: string;
  /** The kinds of thing that were replaced. */
  redactions: string[];
  reason: "clean" | "redacted" | "level_4_stays_local";
};

function parseAliases(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Prepare text for a cloud call at a data level.
 *
 * Level 0 passes through. Level 1 replaces project and company names, level 2
 * adds money, level 3 adds email addresses and phone numbers. Level 4 stays on
 * the device.
 */
export async function prepareCloudPayload(
  db: SqlDatabase,
  userId: string,
  input: {
    text: string;
    level: DataLevel;
    /** Names the caller knows to be contacts. */
    contacts?: string[];
    locale?: Locale;
  }
): Promise<CloudPayload> {
  if (input.level >= 4) {
    return {
      allowed: false,
      text: "",
      redactions: [],
      reason: "level_4_stays_local",
    };
  }

  const projects =
    input.level >= 1
      ? ((await db
          .prepare(
            `SELECT name, aliases FROM projects
             WHERE user_id = ? AND IFNULL(status, 'active') != 'archived'`
          )
          .all(userId)) as Array<{ name: string; aliases: string | null }>)
      : [];
  const organizations = projects.flatMap((project) => [
    project.name,
    ...parseAliases(project.aliases),
  ]);

  const options: RedactionOptions = {
    organizations,
    contacts: input.contacts ?? [],
    redactAmounts: input.level >= 2,
    redactPii: input.level >= 3,
  };
  const { text, redactions } = redactText(input.text, options);

  await writeActionLog(db, {
    user_id: userId,
    actor: "agent",
    action_type: "privacy_gateway_redacted",
    summary: actionSummary(
      "privacy_gateway_redacted",
      { level: input.level, kinds: redactions.join(",") },
      input.locale ?? "en"
    ),
    reason: redactions.length ? "redacted" : "clean",
    entity_type: "privacy_gateway",
    payload: { level: input.level, redactions },
  });

  return {
    allowed: true,
    text,
    redactions,
    reason: redactions.length ? "redacted" : "clean",
  };
}
