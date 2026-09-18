import Foundation

struct APIUser: Codable, Identifiable {
    let id: String
    let name: String?
    let timezone: String
    let language: String
    let calendar_write_enabled: Bool?
}

struct Thought: Codable, Identifiable, Equatable {
    let id: String
    let type: String
    let title: String?
    let content: String
    let original_excerpt: String?
    let status: String?
    let project_id: String?
    let source_input_id: String?
    let created_at: String?
    /// Full text of the original Capture (from raw_inputs join)
    let source_input_content: String?
    let source_input_source: String?
    let source_input_created_at: String?

    var displayTitle: String {
        if let title, !title.isEmpty { return title }
        if content.count <= 40 { return content }
        return String(content.prefix(39)) + "…"
    }

    /// Best-effort original user paste for display
    var rawInputText: String? {
        if let s = source_input_content, !s.isEmpty { return s }
        if let s = original_excerpt, !s.isEmpty { return s }
        return nil
    }

    var hasDistinctRawInput: Bool {
        guard let raw = rawInputText else { return false }
        return raw.trimmingCharacters(in: .whitespacesAndNewlines)
            != content.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

struct Commitment: Codable, Identifiable, Equatable {
    let id: String
    let title: String
    let goal: String?
    let optimized_content: String?
    let status: String?
    let deadline: String?
    let window_start: String?
    let window_end: String?
    let source_thought_id: String?
    let source_input_id: String?
    let source_input_content: String?
    let project_id: String?
    let started_at: String?
    let created_at: String?
    let work_group_key: String?
    let work_group_label: String?
    let work_group_source: String?
    let work_group_reason: String?
    let work_group_manual_override: Int?

    var isFromThought: Bool { source_thought_id != nil }

    var rawInputText: String? {
        guard let source_input_content else { return nil }
        let value = source_input_content.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }

    var optimizedContent: String? {
        guard let optimized_content else { return nil }
        let value = optimized_content.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }

    var isOpen: Bool {
        let s = status ?? ""
        return s != "completed" && s != "cancelled"
    }
}

struct WorkClassificationRebuild: Decodable {
    let status: String
    let changed: Bool
    let assignment_count: Int
    let group_count: Int
    let used_fallback: Bool
}

extension Thought {
    /// True when an open commitment already covers this thought (by link or same capture).
    func hasLinkedOpenWork(in commitments: [Commitment]) -> Bool {
        if status == "converted" { return true }
        return commitments.contains { c in
            guard c.isOpen else { return false }
            if c.source_thought_id == id { return true }
            if let sid = source_input_id, !sid.isEmpty, c.source_input_id == sid {
                return true
            }
            return false
        }
    }
}

struct MemoryConcept: Codable, Identifiable, Hashable {
    let id: String
    let name: String
}

struct MemoryItem: Codable, Identifiable {
    let id: String
    let type: String
    let content: String
    let status: String
    let source: String?
    let confidence: Double?
    let importance: Double?
    let evidence: String?
    let concepts: [MemoryConcept]?
    let concept_names: [String]?
}

struct ActionLogItem: Codable, Identifiable {
    let id: String
    let actor: String
    let action_type: String
    let summary: String
    let reason: String?
    let created_at: String?
}

struct ClarificationOption: Codable, Identifiable {
    let id: String
    let label: String
}

struct Clarification: Codable, Identifiable {
    let id: String
    let kind: String
    let token: String?
    let prompt: String
    let commitment_id: String?
    let options: [ClarificationOption]
}

struct ActionCard: Codable {
    var summary: String
    var thoughts: [Thought]
    var commitments: [Commitment]
    var decisions: [DecisionItem]
    var memory_candidates: [MemoryItem]
    var clarifications: [Clarification]?
    var project_match: ProjectMatchInfo?
    var project_suggestion: ProjectSuggestion?
    var warnings: [String]
    /// Client-only: input id for enrich; not always from server card body
    var source_input_id: String? = nil
    /// Client-only: AI still running in background
    var is_enriching: Bool? = nil
    /// local | enriched
    var stage: String? = nil
}

struct DecisionItem: Codable, Identifiable {
    let id: String
    let title: String
    let reason: String?
}

struct InputResult: Codable {
    let id: String
    let processing_status: String
    let action_card: ActionCard?
    let error: String?
    let stage: String?
    let enriching: Bool?
    let enrich_failed: Bool?
}

/// Commitment as returned by /v1/today (may include kind_label)
struct TodayCommitment: Codable, Identifiable, Equatable {
    let id: String
    let title: String
    let status: String?
    let deadline: String?
    let window_start: String?
    let window_end: String?
    let ai_slot_start: String?
    let ai_slot_end: String?
    let started_at: String?
    let completed_at: String?
    let source_thought_id: String?
    let project_id: String?
    let created_at: String?
    let kind_label: String?

    var isFromThought: Bool { source_thought_id != nil }
}

struct TodayPayload: Codable {
    let date_key: String
    let timezone: String
    let now: TodayCommitment?
    let timeline: [TodayCommitment]
    let risks: [TodayCommitment]
    /// Preview only (server caps at 3)
    let unscheduled: [TodayCommitment]
    let unscheduled_total: Int?
    let unscheduled_from_thought_total: Int?
    let summary: String
    /// Present when empty day was filled from untimed work
    let auto_planned: [TodayAutoPlanned]?
    let planning: TodayPlanningState?
}

extension TodayPayload {
    func containsCommitment(id: String) -> Bool {
        now?.id == id || timeline.contains { $0.id == id }
    }
}

struct TodayAutoPlanned: Codable, Identifiable {
    let id: String
    let title: String
    let reason: String
}

struct TodayPlanningState: Codable {
    let mode: String
    let effective_cap: Int
    let completed_today: Int
    let auto_fill_paused: Bool
}

struct PlanTodayResponse: Codable {
    let date_key: String
    let mode: String
    let effective_cap: Int
    let completed_today: Int
    let remaining_today: Int
    let picked: [TodayAutoPlanned]
    let tip: String?
    let auto_fill_paused: Bool
}

struct ProjectItem: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let description: String?
    /// Long-form product brief for AI grounding (audience, principles, stage…).
    let brief: String?
    let aliases: String?
    let status: String?
    let thought_count: Int?
    let commitment_count: Int?
    let created_at: String?

    /// Whether AI has enough brief to judge transfer/memory against this product.
    var hasSubstantialBrief: Bool {
        (brief ?? "").trimmingCharacters(in: .whitespacesAndNewlines).count >= 40
    }
}

struct ProjectDetail: Codable {
    let project: ProjectItem
    let thoughts: [Thought]
    let commitments: [Commitment]
}

struct ProjectMatchInfo: Codable {
    let project_id: String
    let project_name: String
    let reason: String
}

struct ProjectSuggestion: Codable {
    let suggested_name: String
    let reason: String
}

struct ConceptItem: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let description: String?
    let importance: Double?
    let memory_count: Int?
    let created_at: String?
}
