/** V1 domain types aligned with 01-MVP-Object-Schema */

export type ThoughtType =
  | "idea"
  | "insight"
  | "observation"
  | "research"
  | "decision_candidate";

export type ThoughtStatus = "captured" | "exploring" | "converted" | "archived";

export type CommitmentStatus =
  | "captured"
  | "planned"
  | "scheduled"
  | "completed"
  | "cancelled"
  | "risk";

export type MemoryType =
  | "preference"
  | "project_context"
  | "principle"
  | "decision"
  | "experience";

export type MemoryStatus = "candidate" | "active" | "archived";

export type MemorySource = "user_explicit" | "ai_inferred" | "decision_promote";

export type InputSource =
  | "text"
  | "voice"
  | "shortcut"
  | "menu_bar"
  | "widget"
  | "system_event";

/**
 * Raw-input processing lifecycle.
 *
 * `local` and `enriching` are first-class states of progressive capture:
 * deterministic rules produce a usable ActionCard immediately (`local`), and
 * a background AI pass may later replace it (`enriching` → `processed`).
 */
export type ProcessingStatus =
  | "pending"
  | "local"
  | "enriching"
  | "processed"
  | "failed";

export const THOUGHT_TYPES: ThoughtType[] = [
  "idea",
  "insight",
  "observation",
  "research",
  "decision_candidate",
];

export const MEMORY_TYPES: MemoryType[] = [
  "preference",
  "project_context",
  "principle",
  "decision",
  "experience",
];

export interface User {
  id: string;
  name: string | null;
  timezone: string;
  language: string;
  calendar_write_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClarificationOptionDTO {
  id: string;
  label: string;
}

export interface ClarificationDTO {
  id: string;
  kind: string;
  token?: string | null;
  prompt: string;
  commitment_id?: string | null;
  options: ClarificationOptionDTO[];
}

export interface ProjectSuggestionDTO {
  suggested_name: string;
  reason: string;
}

export interface ActionCard {
  summary: string;
  thoughts: Array<Record<string, unknown>>;
  commitments: Array<Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
  memory_candidates: Array<Record<string, unknown>>;
  clarifications: ClarificationDTO[];
  /** Matched existing project for this input (if any) */
  project_match?: {
    project_id: string;
    project_name: string;
    reason: string;
  } | null;
  /** Suggest creating a new project — never auto-created */
  project_suggestion?: ProjectSuggestionDTO | null;
  warnings: string[];
}
