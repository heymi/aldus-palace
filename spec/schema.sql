-- GENERATED FILE — do not edit.
-- Source: packages/core/src/db/schema.ts
-- Regenerate: pnpm gen:spec
-- V1 schema subset (01-MVP-Object-Schema). Shared by local SQLite and Cloudflare Durable Objects.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  language TEXT NOT NULL DEFAULT 'en',
  calendar_write_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_inputs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  language TEXT,
  raw_audio_ref TEXT,
  client_context TEXT,
  processed_at TEXT,
  -- pending | local | enriching | processed | failed (see domain/types.ts)
  processing_status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  processing_generation_id TEXT,
  processing_lease_until TEXT,
  result_generation_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  /** Long-form product brief for AI grounding (audience, principles, stage…). */
  brief TEXT,
  /** JSON array or comma-separated aliases for matching, e.g. ["Acme Mail","邮件"] */
  aliases TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS thoughts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  original_excerpt TEXT,
  project_id TEXT REFERENCES projects(id),
  status TEXT NOT NULL DEFAULT 'captured',
  importance REAL,
  source_input_id TEXT REFERENCES raw_inputs(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (type IN ('idea', 'insight', 'observation', 'research', 'decision_candidate')),
  CHECK (status IN ('captured', 'exploring', 'converted', 'archived'))
);

CREATE TABLE IF NOT EXISTS commitments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  goal TEXT,
  optimized_content TEXT,
  project_id TEXT REFERENCES projects(id),
  status TEXT NOT NULL DEFAULT 'captured',
  deadline TEXT,
  window_start TEXT,
  window_end TEXT,
  duration_minutes INTEGER,
  importance REAL,
  ai_slot_start TEXT,
  ai_slot_end TEXT,
  scheduled_event_id TEXT,
  source_thought_id TEXT REFERENCES thoughts(id),
  source_input_id TEXT REFERENCES raw_inputs(id),
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (status IN ('captured', 'planned', 'scheduled', 'completed', 'cancelled', 'risk'))
);

-- Replaceable display projection for the Work list. This never changes the
-- Commitment truth source, Today planning, or long-term Memory.
CREATE TABLE IF NOT EXISTS commitment_classifications (
  commitment_id TEXT PRIMARY KEY REFERENCES commitments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  project_id TEXT REFERENCES projects(id),
  group_key TEXT NOT NULL,
  group_label TEXT NOT NULL,
  source TEXT NOT NULL,
  reason TEXT,
  confidence REAL,
  classifier_version TEXT NOT NULL,
  commitment_fingerprint TEXT NOT NULL,
  context_fingerprint TEXT NOT NULL,
  generation_id TEXT NOT NULL,
  manual_override INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (source IN ('ai', 'user', 'fallback'))
);

CREATE TABLE IF NOT EXISTS commitment_classification_runs (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  generation_id TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  context_fingerprint TEXT NOT NULL,
  classifier_version TEXT NOT NULL,
  execution_mode TEXT NOT NULL,
  status TEXT NOT NULL,
  lease_until TEXT,
  assignment_count INTEGER NOT NULL DEFAULT 0,
  group_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (status IN ('running', 'ready', 'failed', 'stale'))
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  reason TEXT,
  project_id TEXT REFERENCES projects(id),
  status TEXT NOT NULL DEFAULT 'active',
  source_thought_id TEXT REFERENCES thoughts(id),
  source_input_id TEXT REFERENCES raw_inputs(id),
  related_memory_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (status IN ('active', 'superseded', 'retracted'))
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id),
  status TEXT NOT NULL DEFAULT 'candidate',
  confidence REAL,
  importance REAL,
  source TEXT NOT NULL,
  evidence TEXT,
  source_input_id TEXT REFERENCES raw_inputs(id),
  source_decision_id TEXT REFERENCES decisions(id),
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (type IN ('preference', 'project_context', 'principle', 'decision', 'experience')),
  CHECK (status IN ('candidate', 'active', 'archived')),
  CHECK (source IN ('user_explicit', 'ai_inferred', 'decision_promote'))
);

-- Cognitive Map: concepts (nodes)
CREATE TABLE IF NOT EXISTS concepts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  description TEXT,
  importance REAL DEFAULT 0.5,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, normalized_name)
);

CREATE TABLE IF NOT EXISTS memory_concepts (
  memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL DEFAULT 'related_to',
  strength REAL DEFAULT 0.7,
  PRIMARY KEY (memory_id, concept_id)
);

CREATE TABLE IF NOT EXISTS concept_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  source_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL DEFAULT 'related_to',
  strength REAL DEFAULT 0.5,
  evidence TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_concepts_user_name ON concepts(user_id, normalized_name);
CREATE INDEX IF NOT EXISTS idx_memory_concepts_concept ON memory_concepts(concept_id);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  is_all_day INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  external_id TEXT,
  commitment_id TEXT REFERENCES commitments(id),
  read_only INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (kind IN ('fixed_external', 'ai_work_block')),
  CHECK (source IN ('apple_calendar', 'google_calendar', 'app'))
);

CREATE TABLE IF NOT EXISTS action_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  actor TEXT NOT NULL,
  action_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  reason TEXT,
  entity_type TEXT,
  entity_id TEXT,
  payload TEXT,
  reversible INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  CHECK (actor IN ('user', 'agent'))
);

CREATE INDEX IF NOT EXISTS idx_raw_inputs_user_created ON raw_inputs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_thoughts_user_created ON thoughts(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_commitments_user_status ON commitments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_commitments_user_deadline ON commitments(user_id, deadline);
CREATE INDEX IF NOT EXISTS idx_commitments_user_slot ON commitments(user_id, ai_slot_start);
CREATE INDEX IF NOT EXISTS idx_commitment_classifications_user_group
  ON commitment_classifications(user_id, group_key);
CREATE INDEX IF NOT EXISTS idx_memories_user_type_status ON memories(user_id, type, status);
CREATE INDEX IF NOT EXISTS idx_events_user_start ON events(user_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_action_logs_user_created ON action_logs(user_id, created_at);

-- Today is a projection over Commitments. This table records assignment
-- provenance without turning "task" into a primary domain object.
CREATE TABLE IF NOT EXISTS today_assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  commitment_id TEXT NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
  date_key TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  assigned_at TEXT NOT NULL,
  removed_at TEXT,
  excluded_until TEXT,
  plan_version TEXT,
  reason TEXT,
  CHECK (source IN ('user', 'agent')),
  CHECK (status IN ('active', 'removed', 'completed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_today_assignments_active
  ON today_assignments(user_id, commitment_id, date_key)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_today_assignments_day
  ON today_assignments(user_id, date_key, status);

CREATE TABLE IF NOT EXISTS planning_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  mode TEXT NOT NULL DEFAULT 'balanced',
  paused_at TEXT,
  pause_reason TEXT,
  last_behavior_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (mode IN ('balanced', 'high_capacity', 'paused'))
);

CREATE TABLE IF NOT EXISTS planning_day_states (
  user_id TEXT NOT NULL REFERENCES users(id),
  date_key TEXT NOT NULL,
  plan_version TEXT,
  effective_cap INTEGER NOT NULL DEFAULT 5,
  tip_shown_level INTEGER,
  queue_fingerprint TEXT,
  queue_observed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, date_key),
  CHECK (effective_cap IN (5, 10)),
  CHECK (tip_shown_level IS NULL OR tip_shown_level IN (5, 10))
);

CREATE TABLE IF NOT EXISTS planning_feedback_episodes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open',
  opened_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  dismissed_assignment_ids TEXT NOT NULL DEFAULT '[]',
  dismissed_project_ids TEXT NOT NULL DEFAULT '[]',
  outcome TEXT,
  target_commitment_id TEXT REFERENCES commitments(id) ON DELETE SET NULL,
  target_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (status IN ('open', 'closed')),
  CHECK (outcome IS NULL OR outcome IN (
    'same_project_task_switch',
    'project_switch',
    'self_defined_task',
    'stopped_working'
  ))
);

CREATE INDEX IF NOT EXISTS idx_planning_feedback_user_opened
  ON planning_feedback_episodes(user_id, status, opened_at);

-- Pending user clarifications (e.g. early-morning 明天/后天)
CREATE TABLE IF NOT EXISTS clarifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  raw_input_id TEXT REFERENCES raw_inputs(id),
  commitment_id TEXT REFERENCES commitments(id),
  kind TEXT NOT NULL,
  token TEXT,
  prompt TEXT NOT NULL,
  options_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  chosen_option TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  CHECK (status IN ('pending', 'resolved', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS idx_clarifications_user_status ON clarifications(user_id, status);
