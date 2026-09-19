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
import {
  PrivacyBlockedError,
  type MessageGuard,
} from "../providers/guard.js";
import type { ChatMessage } from "../providers/types.js";
import { writeActionLog } from "../repos/actionLogs.js";

export type DataLevel = 0 | 1 | 2 | 3 | 4;

export const DEFAULT_PRIVACY_LEVEL: DataLevel = 2;

/** The level a caller configured, clamped to 0–4; defaults to level 2. */
export function resolvePrivacyLevel(
  env: Record<string, string | undefined>
): DataLevel {
  const raw = Number(
    env.PRIVACY_LEVEL ?? env.ALDUS_PALACE_PRIVACY_LEVEL ?? DEFAULT_PRIVACY_LEVEL
  );
  if (!Number.isFinite(raw)) return DEFAULT_PRIVACY_LEVEL;
  return Math.min(4, Math.max(0, Math.floor(raw))) as DataLevel;
}

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

async function loadOrganizations(
  db: SqlDatabase,
  userId: string
): Promise<string[]> {
  const projects = (await db
    .prepare(
      `SELECT name, aliases FROM projects
       WHERE user_id = ? AND IFNULL(status, 'active') != 'archived'`
    )
    .all(userId)) as Array<{ name: string; aliases: string | null }>;
  return projects.flatMap((project) => [
    project.name,
    ...parseAliases(project.aliases),
  ]);
}

function redactionOptions(
  organizations: string[],
  level: DataLevel,
  contacts: string[]
): RedactionOptions {
  return {
    organizations,
    contacts,
    redactAmounts: level >= 2,
    redactPii: level >= 3,
  };
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

  const organizations =
    input.level >= 1 ? await loadOrganizations(db, userId) : [];
  const { text, redactions } = redactText(
    input.text,
    redactionOptions(organizations, input.level, input.contacts ?? [])
  );

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

/**
 * Build the guard a cloud provider calls before it sends anything.
 *
 * Only user-role messages carry the user's words and context, so the system
 * prompt is left untouched. One audit row is written per provider call, not per
 * message. Level 4 throws before any content is prepared.
 */
export function createMessageGuard(
  db: SqlDatabase,
  userId: string,
  options: { level?: DataLevel; contacts?: string[]; locale?: Locale } = {}
): MessageGuard {
  const level = options.level ?? DEFAULT_PRIVACY_LEVEL;

  return async (messages: ChatMessage[]) => {
    if (level >= 4) throw new PrivacyBlockedError("level_4_stays_local");
    if (level === 0) return messages;

    const organizations = await loadOrganizations(db, userId);
    const contacts = options.contacts ?? [];
    const redactions = new Set<string>();
    const safe: ChatMessage[] = [];

    for (const message of messages) {
      if (message.role !== "user") {
        safe.push(message);
        continue;
      }
      const result = redactText(
        message.content,
        redactionOptions(organizations, level, contacts)
      );
      for (const kind of result.redactions) redactions.add(kind);
      safe.push({ ...message, content: result.text });
    }

    const kinds = [...redactions];
    await writeActionLog(db, {
      user_id: userId,
      actor: "agent",
      action_type: "privacy_gateway_redacted",
      summary: actionSummary(
        "privacy_gateway_redacted",
        { level, kinds: kinds.join(",") },
        options.locale ?? "en"
      ),
      reason: kinds.length ? "redacted" : "clean",
      entity_type: "privacy_gateway",
      payload: { level, redactions: kinds },
    });

    return safe;
  };
}
