import Foundation

/// App language catalog. Keys are stable; swap tables when adding locales.
/// V1 ships zh-Hans only — structure is multi-language ready.
enum AppLanguage: String {
    case zhHans = "zh-Hans"
    case en = "en"

    static var current: AppLanguage = .zhHans
}

/// Centralized user-facing strings. Prefer `L10n.x` over string literals in views.
enum L10n {
    private static var lang: AppLanguage { AppLanguage.current }

    // MARK: - Tabs / nav

    enum Tab {
        static var today: String { t(zh: "今日", en: "Today") }
        static var work: String { t(zh: "要做的事", en: "To do") }
        static var thoughts: String { t(zh: "想法", en: "Thoughts") }
        static var projects: String { t(zh: "项目", en: "Projects") }
        static var memory: String { t(zh: "记忆", en: "Memory") }
        static var activity: String { t(zh: "动态", en: "Activity") }
        static var capture: String { t(zh: "输入", en: "Capture") }

        static var sectionDaily: String { t(zh: "日常", en: "Daily") }
        static var sectionLibrary: String { t(zh: "沉淀", en: "Library") }
        static var sectionReview: String { t(zh: "回顾", en: "Review") }
    }

    // MARK: - Common actions

    enum Action {
        static var save: String { t(zh: "保存", en: "Save") }
        static var cancel: String { t(zh: "取消", en: "Cancel") }
        static var edit: String { t(zh: "编辑", en: "Edit") }
        static var delete: String { t(zh: "删除", en: "Delete") }
        static var done: String { t(zh: "完成", en: "Done") }
        static var start: String { t(zh: "开始", en: "Start") }
        static var confirm: String { t(zh: "确认", en: "Confirm") }
        static var discard: String { t(zh: "丢弃", en: "Discard") }
        static var refresh: String { t(zh: "刷新", en: "Refresh") }
        static var create: String { t(zh: "创建", en: "Create") }
        static var close: String { t(zh: "关闭", en: "Close") }
    }

    // MARK: - Confirmations

    enum Confirm {
        static var deleteTitle: String { t(zh: "确认删除？", en: "Delete?") }
        static var deleteThought: String {
            t(zh: "想法会归档，不再出现在列表中。", en: "The thought will be archived.")
        }
        static var deleteWork: String {
            t(zh: "这件事会取消，不再出现在待推进里。", en: "This item will be cancelled.")
        }
        static var deleteMemory: String {
            t(zh: "记忆会归档，之后理解不再参考它。", en: "The memory will be archived.")
        }
        static var deleteProject: String {
            t(zh: "项目会归档。已关联的想法与事项仍会保留。", en: "The project will be archived.")
        }
    }

    // MARK: - Work

    enum Work {
        static var hint: String {
            t(
                zh: "认领后要推进的事项。点选查看，开始后会出现在今日焦点。",
                en: "Things you’ve claimed to push forward."
            )
        }
        static var filterOpen: String { t(zh: "待推进", en: "Open") }
        static var filterFromThought: String { t(zh: "从想法", en: "From thoughts") }
        static var filterDone: String { t(zh: "已结束", en: "Done") }
        static var emptyOpen: String { t(zh: "还没有要做的事", en: "Nothing to do yet") }
        static var titleField: String { t(zh: "标题", en: "Title") }
        static var editTitle: String { t(zh: "修改要做的事", en: "Edit item") }
    }

    // MARK: - Thoughts

    enum Thoughts {
        static var hint: String {
            t(
                zh: "点选一条看全文。左侧是摘要，右侧是系统理解与原文。",
                en: "Select an item to read the full understanding."
            )
        }
        static var filterAll: String { t(zh: "全部", en: "All") }
        static var filterOpen: String { t(zh: "未转化", en: "Open") }
        static var filterConverted: String { t(zh: "已转要做", en: "Converted") }
        static var systemUnderstanding: String { t(zh: "系统理解", en: "Understanding") }
        static var rawInput: String { t(zh: "原始输入", en: "Original input") }
        static var convert: String { t(zh: "转为要做的事", en: "Turn into to-do") }
        static var editTitle: String { t(zh: "修改想法", en: "Edit thought") }
        static var titleField: String { t(zh: "标题", en: "Title") }
        static var contentField: String { t(zh: "内容", en: "Content") }
    }

    // MARK: - Memory

    enum Memory {
        static var hint: String {
            t(
                zh: "只把真正属于你的偏好与原则留下来。临时状态不会变成长期记忆。",
                en: "Only keep preferences and principles that are truly yours."
            )
        }
        static var pending: String { t(zh: "待你确认", en: "Pending") }
        static var confirmed: String { t(zh: "已记住", en: "Confirmed") }
        static var confirmRemember: String { t(zh: "确认记住", en: "Confirm") }
        static var editTitle: String { t(zh: "修改记忆", en: "Edit memory") }
        static var contentField: String { t(zh: "内容", en: "Content") }
    }

    // MARK: - Projects

    enum Projects {
        static var hint: String {
            t(
                zh: "把想法和要做的事归到同一个产品下，方便之后自动关联。",
                en: "Group thoughts and to-dos under one product context."
            )
        }
        static var newProject: String { t(zh: "新建项目", en: "New project") }
        static var editTitle: String { t(zh: "修改项目", en: "Edit project") }
        static var nameField: String { t(zh: "名称", en: "Name") }
        static var descField: String { t(zh: "描述", en: "Description") }
        static var aliasesField: String { t(zh: "别名", en: "Aliases") }
    }

    // MARK: - Activity

    enum Activity {
        static var hint: String {
            t(
                zh: "你和 AI 最近做了什么——不是技术日志，是可回顾的足迹。",
                en: "What you and the AI did recently."
            )
        }
        static var empty: String { t(zh: "还没有动态", en: "No activity yet") }
        static var emptyHint: String {
            t(
                zh: "发送一条输入后，理解、整理、确认等动作会出现在这里。",
                en: "After you capture something, activity will show up here."
            )
        }
        static var you: String { t(zh: "你", en: "You") }
        static var ai: String { t(zh: "AI", en: "AI") }
        static var today: String { t(zh: "今天", en: "Today") }
        static var yesterday: String { t(zh: "昨天", en: "Yesterday") }
        static var earlier: String { t(zh: "更早", en: "Earlier") }
        static var justNow: String { t(zh: "刚刚", en: "Just now") }

        /// Localized action title (short). Prefer over raw action_type.
        static func actionTitle(_ type: String) -> String {
            switch type {
            case "input_captured", "input_received", "capture", "input_created":
                return t(zh: "记下输入", en: "Captured input")
            case "processing_input":
                return t(zh: "理解中", en: "Understanding")
            case "objects_extracted", "understand", "understood":
                return t(zh: "理解完成", en: "Understood")
            case "thought_created", "create_thought":
                return t(zh: "整理出想法", en: "Created thought")
            case "commitment_created", "create_commitment":
                return t(zh: "记下要做的事", en: "Created to-do")
            case "user_started", "commitment_started", "start_commitment":
                return t(zh: "开始推进", en: "Started")
            case "user_completed", "commitment_completed", "complete_commitment":
                return t(zh: "完成", en: "Completed")
            case "commitment_cancelled", "cancel_commitment":
                return t(zh: "取消", en: "Cancelled")
            case "commitment_updated":
                return t(zh: "修改要做的事", en: "Edited to-do")
            case "commitment_deleted":
                return t(zh: "删除要做的事", en: "Deleted to-do")
            case "thought_converted", "convert_thought":
                return t(zh: "想法转为要做", en: "Thought → to-do")
            case "thought_updated":
                return t(zh: "修改想法", en: "Edited thought")
            case "thought_deleted":
                return t(zh: "删除想法", en: "Deleted thought")
            case "memory_candidate_created", "memory_candidate", "memory_extracted":
                return t(zh: "提炼记忆候选", en: "Memory candidate")
            case "memory_confirmed", "confirm_memory":
                return t(zh: "确认记忆", en: "Confirmed memory")
            case "memory_rejected", "reject_memory":
                return t(zh: "丢弃记忆", en: "Discarded memory")
            case "memory_updated":
                return t(zh: "修改记忆", en: "Edited memory")
            case "memory_deleted":
                return t(zh: "删除记忆", en: "Deleted memory")
            case "memory_context_injected":
                return t(zh: "参考记忆", en: "Used memories")
            case "clarification_requested":
                return t(zh: "需要确认时间", en: "Time clarification")
            case "clarification_resolved":
                return t(zh: "确认时间", en: "Time confirmed")
            case "project_created", "create_project":
                return t(zh: "新建项目", en: "Created project")
            case "project_updated":
                return t(zh: "修改项目", en: "Edited project")
            case "project_deleted":
                return t(zh: "删除项目", en: "Deleted project")
            case "project_linked", "relink_project", "project_relinked":
                return t(zh: "关联到项目", en: "Linked project")
            case "commitment_titles_rewritten":
                return t(zh: "重写标题", en: "Rewrote titles")
            case "commitments_deduped":
                return t(zh: "清理重复事项", en: "Deduped to-dos")
            case "work_classification_rebuilt":
                return t(zh: "整理工作脉络", en: "Organized work streams")
            case "work_classification_overridden":
                return t(zh: "调整工作脉络", en: "Adjusted work stream")
            case "memories_deduped":
                return t(zh: "清理重复记忆", en: "Deduped memories")
            default:
                // Never surface raw snake_case English to the user
                return t(zh: "系统动作", en: "System action")
            }
        }

        /// Body line: prefer server summary if already Chinese; else localized title only.
        static func displaySummary(actionType: String, summary: String) -> String {
            let trimmed = summary.trimmingCharacters(in: .whitespacesAndNewlines)
            if looksChinese(trimmed) {
                return trimmed
            }
            // English / machine leftovers — hide and use catalog
            return actionTitle(actionType)
        }

        static func actorLabel(_ actor: String) -> String {
            switch actor.lowercased() {
            case "agent", "ai", "system": return ai
            case "user": return you
            default: return actor
            }
        }

        static func isAI(_ actor: String) -> Bool {
            let a = actor.lowercased()
            return a == "agent" || a == "ai" || a == "system"
        }

        private static func looksChinese(_ s: String) -> Bool {
            s.unicodeScalars.contains { sc in
                (0x4E00 ... 0x9FFF).contains(sc.value)
                    || (0x3400 ... 0x4DBF).contains(sc.value)
            }
        }
    }

    // MARK: - Status / type labels

    enum Labels {
        static func thoughtType(_ t: String) -> String {
            switch t {
            case "idea": return Self.t(zh: "想法", en: "Idea")
            case "insight": return Self.t(zh: "洞察", en: "Insight")
            case "observation": return Self.t(zh: "观察", en: "Observation")
            case "research": return Self.t(zh: "研究", en: "Research")
            case "decision_candidate": return Self.t(zh: "决策候选", en: "Decision candidate")
            default: return t
            }
        }

        static func thoughtStatus(_ s: String) -> String {
            switch s {
            case "captured": return Self.t(zh: "已记录", en: "Captured")
            case "exploring": return Self.t(zh: "探索中", en: "Exploring")
            case "converted": return Self.t(zh: "已转要做", en: "Converted")
            case "archived": return Self.t(zh: "已归档", en: "Archived")
            default: return s
            }
        }

        static func memoryType(_ t: String) -> String {
            switch t {
            case "preference": return Self.t(zh: "偏好", en: "Preference")
            case "principle": return Self.t(zh: "原则", en: "Principle")
            case "project_context": return Self.t(zh: "项目背景", en: "Project context")
            case "decision": return Self.t(zh: "决策", en: "Decision")
            case "experience": return Self.t(zh: "经历", en: "Experience")
            default: return t
            }
        }

        static func commitmentStatus(_ s: String) -> String {
            switch s {
            case "captured": return Self.t(zh: "未开始", en: "Not started")
            case "planned", "scheduled": return Self.t(zh: "已安排", en: "Planned")
            case "completed": return Self.t(zh: "已完成", en: "Completed")
            case "cancelled": return Self.t(zh: "已取消", en: "Cancelled")
            case "risk": return Self.t(zh: "有风险", en: "At risk")
            default: return s
            }
        }

        private static func t(zh: String, en: String) -> String {
            L10n.t(zh: zh, en: en)
        }
    }

    // MARK: - Errors

    enum Error {
        static var invalidResponse: String {
            t(zh: "无法解析服务响应", en: "Invalid response")
        }
        static var cannotConnect: String {
            t(zh: "无法连接服务，请检查网络后重试", en: "Cannot connect to the service")
        }
    }

    // MARK: - Helper

    fileprivate static func t(zh: String, en: String) -> String {
        switch lang {
        case .zhHans: return zh
        case .en: return en
        }
    }
}
