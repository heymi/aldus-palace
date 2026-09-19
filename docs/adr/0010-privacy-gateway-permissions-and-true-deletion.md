---
status: accepted
---

# A privacy gateway, scoped permissions and true deletion

## Context

The privacy architecture was design only: the runtime held the user's most
sensitive data, sent text to models unchanged, had no permission model, and had
no way to delete everything. `SECURITY.md` was honest about the posture, but the
mechanisms did not exist.

## Decision

- **Redaction is a pure function.** `redactText` replaces known contacts with
  `[contact]`, project and company names with `[business]`, money with
  `[amount]`, and — at higher levels — emails and phone numbers with `[email]`
  and `[phone]`. Structured patterns run first, so a company name inside an email
  does not hide the address.
- **The gateway prepares the call by data level.** `prepareCloudPayload` maps
  levels 0–3 onto the redaction options and refuses level 4 with
  `level_4_stays_local`. Each call writes an action-log entry with the level and
  the kinds redacted, never the content.
- **Permissions are scopes, and absence means no.** `permission_grants` holds
  granted scopes; `calendar.read` is the only default, and `memoryPermission`
  reports `private`, `sync` or `ai_assist` from the memory scopes. Grants and
  revocations are logged.
- **Deletion is real.** `purgeUserData` requires `confirm: true` and deletes
  every row the user owns in one transaction, children first. The purge record is
  written before the logs are removed, so nothing of the user's survives — a
  caller that needs proof records it outside the database.
- **Every cloud call is routed through the gateway.** A cloud provider cannot be
  built without the guard attached (ADR 0011), so a call cannot leave
  unredacted.

## Consequences

- The three principles are mechanisms: ownership (a file you own plus true
  deletion), minimum exposure (redaction by level), local first (level 4 and the
  whole offline path).
- Permissions and the gateway are visible over HTTP: `/v1/permissions`,
  `/v1/privacy/redact`, `/v1/me/purge`.
- Local encryption remains unimplemented and is tracked in `ROADMAP.md`.
- Covered by `packages/core/test/privacy.test.ts`.
