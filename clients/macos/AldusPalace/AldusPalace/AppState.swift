import Foundation
import os
import SwiftUI

@MainActor
final class AppState: ObservableObject {
    @Published var selectedTab: NavTab = .today
    @Published var requestedCommitmentID: String?
    @Published var lastActionCard: ActionCard?
    /// Input id currently being AI-enriched (nil when idle).
    @Published var enrichingInputId: String?
    @Published var thoughts: [Thought] = []
    @Published var commitments: [Commitment] = []
    @Published var memories: [MemoryItem] = []
    @Published var concepts: [ConceptItem] = []
    @Published var activity: [ActionLogItem] = []
    /// Pending time clarifications — shown above Capture input.
    @Published var pendingClarifications: [Clarification] = []
    @Published var today: TodayPayload?
    @Published var projects: [ProjectItem] = []
    @Published var isBusy = false
    @Published var errorMessage: String?
    /// 成功提示（如转为要做的事），显示在 Today 顶部
    @Published var userBanner: String?

    func showCommitment(_ id: String) {
        requestedCommitmentID = id
        selectedTab = .work
    }
    @Published var user: APIUser?
    @Published private(set) var isClassifyingWork = false

    let client = APIClient()

    var isVisualPreview: Bool {
#if DEBUG
        ProcessInfo.processInfo.environment["ALDUS_VISUAL_PREVIEW"] == "1"
#else
        false
#endif
    }

    init() {
#if DEBUG
        if isVisualPreview {
            seedVisualPreview()
        }
#endif
    }

    // MARK: - Silent background refresh

    /// True while background refreshes are failing transiently (offline / 5xx).
    /// Shown as a quiet sidebar indicator; never a blocking banner.
    @Published private(set) var isOffline = false
    private var retryTask: Task<Void, Never>?
    private var retryDelay: TimeInterval = 5
    private var isRefreshing = false
    private var workClassificationTask: Task<Void, Never>?
    private let logger = Logger(subsystem: "app.alduspalace.AldusPalace", category: "refresh")

    /// Background refresh entry point: silent, self-healing with backoff.
    /// `reconcile: true` (first bootstrap and after user actions) also runs
    /// planToday; the retry loop must NOT reconcile — it would spam plan POSTs
    /// and overwrite userBanner feedback from user actions.
    func performSilentRefresh(reconcile: Bool = false) async {
        guard !isVisualPreview else { return }
        guard !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }

        do {
            user = try await client.me()
        } catch let APIError.http(status: status, message: _) where status == 401 {
            // Auth is a configuration problem, not a transient one: no retry loop.
            logger.error("auth rejected (401); not scheduling retry")
            retryTask?.cancel()
            retryTask = nil
            isOffline = false
            errorMessage = "登录态失效（401），请检查 token 配置"
            return
        } catch {
            if shouldCountFailure(error, label: "me") {
                isOffline = true
                scheduleRetry()
            }
            return
        }

        var ok = true
        if await !refreshLists() { ok = false }
        if await !refreshToday(reconcile: reconcile) { ok = false }
        if await !refreshProjects() { ok = false }
        // Non-fatal for older APIs — deliberately outside the failure aggregate.
        await refreshConcepts()
        await refreshPendingClarifications()

        if ok {
            isOffline = false
            retryTask?.cancel()
            retryTask = nil
            retryDelay = 5
        } else {
            isOffline = true
            scheduleRetry()
        }
    }

    private func scheduleRetry() {
        retryTask?.cancel()
        let delay = retryDelay
        retryDelay = min(retryDelay * 2, 60)
        retryTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            await self?.performSilentRefresh()
        }
    }

    /// Cancellations (view teardown, superseded retries) are not failures.
    /// Everything else is logged so silent never means untraceable.
    private func shouldCountFailure(_ error: Error, label: String) -> Bool {
        if error is CancellationError { return false }
        if let urlError = error as? URLError, urlError.code == .cancelled { return false }
        logger.notice("silent refresh failed [\(label, privacy: .public)]: \(error.localizedDescription, privacy: .public)")
        return true
    }

    func bootstrap() async {
        guard !isVisualPreview else { return }
        await performSilentRefresh(reconcile: true)
    }

    func refreshConcepts() async {
        guard !isVisualPreview else { return }
        do {
            concepts = try await client.concepts()
        } catch {
            // non-fatal if older API
        }
    }

    @discardableResult
    func refreshProjects() async -> Bool {
        guard !isVisualPreview else { return true }
        do {
            projects = try await client.projects()
            return true
        } catch {
            return shouldCountFailure(error, label: "projects")
        }
    }

    @discardableResult
    func createProject(
        name: String,
        description: String?,
        brief: String? = nil,
        aliases: [String]
    ) async -> ProjectItem? {
        isBusy = true
        defer { isBusy = false }
        do {
            let p = try await client.createProject(
                name: name,
                description: description,
                brief: brief,
                aliases: aliases
            )
            await refreshProjects()
            return p
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func relinkProject(_ id: String) async {
        guard !id.isEmpty else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            let (t, c) = try await client.relinkProject(id: id)
            await refreshProjects()
            await refreshLists()
            errorMessage = nil
            lastActionCard = ActionCard(
                summary: "已回溯关联：想法 \(t) · 承诺 \(c)",
                thoughts: [],
                commitments: [],
                decisions: [],
                memory_candidates: [],
                clarifications: [],
                project_match: nil,
                project_suggestion: nil,
                warnings: []
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func createSuggestedProject(name: String) async {
        if let p = await createProject(name: name, description: nil, aliases: []) {
            await relinkProject(p.id)
        }
    }

    @discardableResult
    func refreshToday(reconcile: Bool = true) async -> Bool {
        guard !isVisualPreview else {
            errorMessage = nil
            return true
        }
        if reconcile {
            do {
                let plan = try await client.planToday()
                if let tip = plan.tip, !tip.isEmpty {
                    userBanner = tip
                } else if userBanner == "今天已经工作很久了，可以休息休息。" {
                    userBanner = nil
                }
            } catch {
                // plan 挂 ≠ 断网：静默记录，不计入离线聚合
                logger.notice("planToday reconcile failed: \(error.localizedDescription, privacy: .public)")
            }
        }
        do {
            today = try await client.today()
            return true
        } catch {
            return shouldCountFailure(error, label: "today")
        }
    }

    /// Title lookup for action feedback banners.
    private func commitmentTitle(_ id: String) -> String? {
        if let c = commitments.first(where: { $0.id == id }) { return c.title }
        if let n = today?.now, n.id == id { return n.title }
        return today?.timeline.first(where: { $0.id == id })?.title
    }

    func arrangeToday(_ id: String) async {
        let title = commitmentTitle(id)
        do {
            _ = try await client.arrangeToday(id: id)
            await refreshToday()
            await refreshLists(classifyWork: false)
            userBanner = title.map { "已安排到今天「\($0)」" } ?? "已安排到今天"
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func removeFromToday(_ id: String) async {
        let title = commitmentTitle(id)
        do {
            try await client.removeFromToday(id: id)
            await refreshToday()
            await refreshLists(classifyWork: false)
            userBanner = title.map { "已移出今天「\($0)」" } ?? "已移出今天"
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func completeCommitment(_ id: String) async {
        let title = commitmentTitle(id)
        do {
            _ = try await client.completeCommitment(id: id)
            await refreshToday()
            await refreshLists(classifyWork: false)
            userBanner = title.map { "已完成「\($0)」" } ?? "已完成"
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func startCommitment(_ id: String) async {
        let title = commitmentTitle(id)
        do {
            _ = try await client.startCommitment(id: id)
            await refreshToday()
            await refreshLists(classifyWork: false)
            userBanner = title.map { "已开始「\($0)」" } ?? "已开始"
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func convertThoughtToCommitment(_ id: String) async {
        isBusy = true
        defer { isBusy = false }
        do {
            let result = try await client.convertThoughtToCommitment(id: id)
            await refreshLists()
            await refreshToday()
            if result.alreadyExists {
                userBanner =
                    result.message
                    ?? "该想法已有对应的要做的事，未重复创建：「\(result.commitment.title)」"
            } else {
                userBanner =
                    "已转为要做的事：「\(result.commitment.title)」→ 可开始/完成；不会再重复创建。"
            }
            selectedTab = .work
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func cancelCommitment(_ id: String) async {
        do {
            try await client.cancelCommitment(id: id)
            await refreshLists(classifyWork: false)
            await refreshToday()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Update / Delete

    func updateThought(id: String, title: String?, content: String) async {
        isBusy = true
        defer { isBusy = false }
        do {
            _ = try await client.updateThought(id: id, title: title, content: content)
            await refreshLists()
            userBanner = "想法已更新"
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteThought(id: String) async {
        isBusy = true
        defer { isBusy = false }
        do {
            try await client.deleteThought(id: id)
            await refreshLists()
            userBanner = "想法已删除"
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateCommitment(id: String, title: String, optimizedContent: String?) async {
        isBusy = true
        defer { isBusy = false }
        do {
            _ = try await client.updateCommitment(id: id, title: title, optimizedContent: optimizedContent)
            await refreshLists()
            await refreshToday()
            userBanner = "要做的事已更新"
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteCommitment(id: String) async {
        isBusy = true
        defer { isBusy = false }
        do {
            try await client.deleteCommitment(id: id)
            await refreshLists(classifyWork: false)
            await refreshToday()
            userBanner = "要做的事已删除"
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateMemory(id: String, content: String) async {
        isBusy = true
        defer { isBusy = false }
        do {
            _ = try await client.updateMemory(id: id, content: content)
            await refreshLists()
            await refreshConcepts()
            userBanner = "记忆已更新"
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteMemory(id: String) async {
        isBusy = true
        defer { isBusy = false }
        do {
            try await client.deleteMemory(id: id)
            await refreshLists()
            await refreshConcepts()
            userBanner = "记忆已删除"
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateProject(
        id: String,
        name: String,
        description: String?,
        brief: String? = nil,
        aliases: [String]
    ) async {
        isBusy = true
        defer { isBusy = false }
        do {
            _ = try await client.updateProject(
                id: id,
                name: name,
                description: description,
                brief: brief,
                aliases: aliases
            )
            await refreshProjects()
            await refreshLists()
            userBanner = "项目已更新"
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteProject(id: String) async {
        isBusy = true
        defer { isBusy = false }
        do {
            try await client.deleteProject(id: id)
            await refreshProjects()
            await refreshLists()
            userBanner = "项目已删除"
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func dedupeCommitments() async {
        isBusy = true
        defer { isBusy = false }
        do {
            let n = try await client.dedupeCommitments()
            await refreshLists(classifyWork: false)
            await refreshToday()
            userBanner = n > 0 ? "已清理 \(n) 条重复的要做的事" : "没有发现可合并的重复项"
            selectedTab = .work
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func rewriteCommitmentTitles() async {
        isBusy = true
        defer { isBusy = false }
        do {
            let n = try await client.rewriteCommitmentTitles()
            await refreshLists()
            await refreshToday()
            userBanner = n > 0 ? "已重写 \(n) 条为可执行标题（推进：…）" : "标题已是可执行形式"
            selectedTab = .work
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @discardableResult
    func refreshLists(classifyWork: Bool = true) async -> Bool {
        guard !isVisualPreview else { return true }
        do {
            async let t = client.thoughts()
            async let c = client.commitments()
            async let m = client.memories()
            async let a = client.activity()
            thoughts = try await t
            commitments = try await c
            memories = try await m
            activity = try await a
            if classifyWork { scheduleWorkClassification() }
            return true
        } catch {
            // 允许部分更新：各列表独立，已完成赋值的保留新数据
            return shouldCountFailure(error, label: "lists")
        }
    }

    /// Rebuilds only a replaceable Work-list projection. It never mutates
    /// Commitments, Today planning, Projects, Concepts, or long-term Memory.
    private func scheduleWorkClassification() {
        guard commitments.filter(\.isOpen).count >= 5 else { return }
        guard workClassificationTask == nil else { return }
        workClassificationTask = Task { @MainActor [weak self] in
            guard let self else { return }
            isClassifyingWork = true
            defer {
                isClassifyingWork = false
                workClassificationTask = nil
            }
            do {
                var result = try await client.rebuildCommitmentClassifications()
                var waitedForOwner = false
                for _ in 0..<12 where result.status == "running" {
                    waitedForOwner = true
                    try await Task.sleep(for: .seconds(1))
                    result = try await client.rebuildCommitmentClassifications()
                }
                if result.status == "ready", result.changed || waitedForOwner {
                    commitments = try await client.commitments()
                } else if result.status == "running" || result.status == "stale" {
                    let retryDelay: Duration = result.status == "stale" ? .seconds(1) : .seconds(5)
                    Task { @MainActor [weak self] in
                        try? await Task.sleep(for: retryDelay)
                        self?.scheduleWorkClassification()
                    }
                }
            } catch {
                // Older APIs and AI failures keep the current/fallback list.
                logger.notice("work classification skipped: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    func overrideCommitmentClassification(id: String, groupKey: String) async {
        do {
            try await client.overrideCommitmentClassification(id: id, groupKey: groupKey)
            commitments = try await client.commitments()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refreshPendingClarifications() async {
        guard !isVisualPreview else { return }
        do {
            pendingClarifications = try await client.pendingClarifications()
        } catch {
            // non-fatal
        }
    }

    func capture(_ text: String, returningTo destination: NavTab = .capture) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        isBusy = true
        errorMessage = nil
        do {
            // 1) Instant local rules
            let result = try await client.submitInput(content: trimmed, mode: "progressive")
            var card = result.action_card
            card?.source_input_id = result.id
            card?.stage = result.stage ?? result.processing_status
            // Defensive: any of these means AI still needs to run
            let needsEnrich =
                result.enriching == true
                || result.stage == "local"
                || result.processing_status == "local"
            card?.is_enriching = needsEnrich
            lastActionCard = card
            if let cardClars = card?.clarifications, !cardClars.isEmpty {
                pendingClarifications = cardClars
            }
            await refreshLists()
            await refreshPendingClarifications()
            await refreshToday()
            selectedTab = destination
            isBusy = false

            // 2) AI in background: poll until processed (server also auto-enriches)
            if needsEnrich {
                enrichingInputId = result.id
                let inputId = result.id
                Task { @MainActor [weak self] in
                    await self?.enrichCapture(inputId: inputId)
                }
            }
        } catch {
            isBusy = false
            errorMessage = error.localizedDescription
        }
    }

    /// Poll / enrich until AI finishes; replace action card when done.
    private func enrichCapture(inputId: String) async {
        defer {
            if enrichingInputId == inputId {
                enrichingInputId = nil
            }
        }
        do {
            // Prefer wait loop: server may already be enriching in background
            let result = try await client.waitForEnrichedInput(id: inputId)
            var card = result.action_card
            card?.source_input_id = inputId
            card?.stage = "enriched"
            card?.is_enriching = false

            let stillShowing = lastActionCard?.source_input_id == inputId
            if stillShowing {
                withAnimation(.easeInOut(duration: 0.28)) {
                    lastActionCard = card
                }
                if let cardClars = card?.clarifications, !cardClars.isEmpty {
                    pendingClarifications = cardClars
                }
                userBanner = "AI 已完成深化理解"
            }
            await refreshLists()
            await refreshPendingClarifications()
            await refreshToday()
        } catch {
            if lastActionCard?.source_input_id == inputId {
                var card = lastActionCard
                card?.is_enriching = false
                card?.stage = "local"
                lastActionCard = card
            }
            userBanner = "AI 深化未完成，已保留本地理解：\(error.localizedDescription)"
        }
    }

    func dismissActionCard() {
        lastActionCard = nil
        enrichingInputId = nil
    }

    /// One-tap after capture: confirm all memory candidates, optional project, then close.
    /// Keeps the receipt path to a single decision — no per-item button hunting.
    func acceptActionCard(rememberMemories: Bool = true) async {
        guard let card = lastActionCard else {
            dismissActionCard()
            return
        }
        // Wait for AI replace so we don't confirm provisional local memories only
        if card.is_enriching == true {
            userBanner = "AI 仍在深化理解，完成后即可确认。"
            return
        }
        isBusy = true
        defer { isBusy = false }

        if rememberMemories {
            for m in card.memory_candidates {
                do {
                    try await client.confirmMemory(id: m.id)
                } catch {
                    // Continue others; surface last error
                    errorMessage = error.localizedDescription
                }
            }
        } else {
            for m in card.memory_candidates {
                do {
                    try await client.rejectMemory(id: m.id)
                } catch {
                    errorMessage = error.localizedDescription
                }
            }
        }

        if let sug = card.project_suggestion {
            // Quiet: create suggested project when user accepts receipt
            await createSuggestedProject(name: sug.suggested_name)
        }

        await refreshLists()
        await refreshConcepts()
        await refreshToday()

        if rememberMemories, !card.memory_candidates.isEmpty {
            userBanner = "已记住 \(card.memory_candidates.count) 条；可随时在「记忆」里改或删。"
        }

        lastActionCard = nil
    }

    func confirmMemory(_ id: String) async {
        do {
            try await client.confirmMemory(id: id)
            await refreshLists()
            await refreshConcepts()
            if var card = lastActionCard {
                card.memory_candidates.removeAll { $0.id == id }
                lastActionCard = card
            }
            userBanner = "记忆已确认；后续输入会参考它。可在「记忆」里改或删。"
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func rejectMemory(_ id: String) async {
        do {
            try await client.rejectMemory(id: id)
            await refreshLists()
            if var card = lastActionCard {
                card.memory_candidates.removeAll { $0.id == id }
                lastActionCard = card
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func resolveClarification(_ clarificationId: String, optionId: String) async {
        isBusy = true
        errorMessage = nil
        defer { isBusy = false }
        do {
            let commitment = try await client.resolveClarification(
                id: clarificationId,
                optionId: optionId
            )
            pendingClarifications.removeAll { $0.id == clarificationId }
            if var card = lastActionCard {
                card.clarifications?.removeAll { $0.id == clarificationId }
                card.summary = "已确认时间"
                if let commitment {
                    if let idx = card.commitments.firstIndex(where: { $0.id == commitment.id }) {
                        card.commitments[idx] = commitment
                    } else {
                        card.commitments.insert(commitment, at: 0)
                    }
                }
                lastActionCard = card
            } else if let commitment {
                lastActionCard = ActionCard(
                    summary: "已确认时间",
                    thoughts: [],
                    commitments: [commitment],
                    decisions: [],
                    memory_candidates: [],
                    clarifications: [],
                    warnings: []
                )
            }
            await refreshLists()
            await refreshPendingClarifications()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#if DEBUG
private extension AppState {
    func seedVisualPreview() {
        selectedTab = .today
        user = APIUser(
            id: "preview-user",
            name: "Alex",
            timezone: "Asia/Shanghai",
            language: "zh-CN",
            calendar_write_enabled: false
        )

        projects = [
            ProjectItem(
                id: "project-aldus",
                name: "Aldus",
                description: "让个人 AI 真正理解上下文，并把想法自然推进为行动。",
                brief: "面向需要管理复杂信息与长期目标的个人用户。产品以理解、结构化、规划和记忆为核心，减少用户维护系统的负担。",
                aliases: "Aldus Palace",
                status: "active",
                thought_count: 4,
                commitment_count: 5,
                created_at: "2026-07-18T09:20:00Z"
            ),
            ProjectItem(
                id: "project-launch",
                name: "秋季发布",
                description: "完成首轮产品叙事、内测和发布准备。",
                brief: "围绕核心用户价值组织发布节奏，先验证完整闭环，再逐步扩大邀请范围。",
                aliases: "Launch",
                status: "active",
                thought_count: 2,
                commitment_count: 3,
                created_at: "2026-07-21T11:30:00Z"
            )
        ]

        thoughts = [
            Thought(
                id: "thought-1",
                type: "idea",
                title: "把首页从任务清单变成注意力入口",
                content: "今日页面应该只回答现在最值得推进什么，以及接下来有什么风险。",
                original_excerpt: "首页不要堆任务，应该先告诉我现在做什么。",
                status: "active",
                project_id: "project-aldus",
                source_input_id: "input-1",
                created_at: "2026-07-29T01:12:00Z",
                source_input_content: "首页不要堆任务，应该先告诉我现在做什么。",
                source_input_source: "capture",
                source_input_created_at: "2026-07-29T01:12:00Z"
            ),
            Thought(
                id: "thought-2",
                type: "insight",
                title: "信任来自可解释和可撤销",
                content: "AI 可以主动整理低风险信息，但外部沟通和永久记忆必须明确确认。",
                original_excerpt: nil,
                status: "converted",
                project_id: "project-aldus",
                source_input_id: "input-2",
                created_at: "2026-07-28T08:40:00Z",
                source_input_content: nil,
                source_input_source: "capture",
                source_input_created_at: "2026-07-28T08:40:00Z"
            ),
            Thought(
                id: "thought-3",
                type: "question",
                title: "怎样让发布叙事更克制",
                content: "用一个具体场景说明从捕捉到行动的完整闭环，而不是罗列功能。",
                original_excerpt: "发布页是不是应该少讲功能，多讲一个完整故事？",
                status: "active",
                project_id: "project-launch",
                source_input_id: "input-3",
                created_at: "2026-07-27T13:05:00Z",
                source_input_content: "发布页是不是应该少讲功能，多讲一个完整故事？",
                source_input_source: "capture",
                source_input_created_at: "2026-07-27T13:05:00Z"
            )
        ]

        commitments = [
            previewCommitment(
                id: "commitment-now",
                title: "Refine the Aldus product narrative",
                detail: "Why now: the identity direction is clear, and this decision unblocks the first product prototype.",
                projectID: "project-aldus",
                groupKey: "aldus-design",
                groupLabel: "Aldus 视觉系统",
                groupReason: "同属 Mac 客户端体验收敛"
            ),
            previewCommitment(
                id: "commitment-2",
                title: "Review system architecture",
                detail: "Confirm the core system boundaries before implementation.",
                projectID: "project-aldus",
                groupKey: "aldus-design",
                groupLabel: "Aldus 视觉系统",
                groupReason: "共享同一组件规范"
            ),
            previewCommitment(
                id: "commitment-3",
                title: "校准字体层级和正文密度",
                detail: "仅三级大标题强调，其余文字保持常规字重。",
                projectID: "project-aldus",
                groupKey: "aldus-design",
                groupLabel: "Aldus 视觉系统",
                groupReason: "共同影响界面阅读节奏"
            ),
            previewCommitment(
                id: "commitment-4",
                title: "Product conversation",
                detail: "Align the product story and the first user outcome.",
                projectID: "project-launch",
                groupKey: "launch-story",
                groupLabel: "发布叙事",
                groupReason: "共同服务秋季发布"
            ),
            previewCommitment(
                id: "commitment-5",
                title: "Capture decisions",
                detail: "Turn the conversation into durable decisions.",
                projectID: "project-launch",
                groupKey: "launch-story",
                groupLabel: "发布叙事",
                groupReason: "共同服务秋季发布"
            ),
            previewCommitment(
                id: "commitment-6",
                title: "复核记忆确认的产品边界",
                detail: "永久记忆需要可解释、可修改和可删除。",
                projectID: "project-aldus",
                groupKey: "trust",
                groupLabel: "信任与控制",
                groupReason: "同属用户信任机制"
            ),
            previewCommitment(
                id: "commitment-7",
                title: "补齐外部行动的确认提示",
                detail: "发送、删除和不可逆操作必须先确认。",
                projectID: "project-aldus",
                groupKey: "trust",
                groupLabel: "信任与控制",
                groupReason: "同属用户信任机制"
            )
        ]

        let now = previewTodayCommitment(
            id: "commitment-now",
            title: "Refine the Aldus product narrative",
            slotStart: "2026-07-29T09:30:00+08:00",
            slotEnd: "2026-07-29T10:15:00+08:00",
            projectID: "project-aldus",
            kind: "正在进行"
        )
        let next = previewTodayCommitment(
            id: "commitment-2",
            title: "Review system architecture",
            slotStart: "2026-07-29T10:30:00+08:00",
            slotEnd: "2026-07-29T11:10:00+08:00",
            projectID: "project-aldus",
            kind: "AI 建议"
        )
        let later = previewTodayCommitment(
            id: "commitment-4",
            title: "Product conversation",
            slotStart: "2026-07-29T14:00:00+08:00",
            slotEnd: "2026-07-29T15:00:00+08:00",
            projectID: "project-launch",
            kind: "Fixed"
        )
        let final = previewTodayCommitment(
            id: "commitment-5",
            title: "Capture decisions",
            slotStart: "2026-07-29T16:20:00+08:00",
            slotEnd: "2026-07-29T16:45:00+08:00",
            projectID: "project-launch",
            kind: "Flexible"
        )
        today = TodayPayload(
            date_key: "2026-07-29",
            timezone: "Asia/Shanghai",
            now: now,
            timeline: [now, next, later, final],
            risks: [],
            unscheduled: [
                previewTodayCommitment(
                    id: "commitment-6",
                    title: "复核记忆确认的产品边界",
                    slotStart: nil,
                    slotEnd: nil,
                    projectID: "project-aldus",
                    kind: "尚未安排"
                )
            ],
            unscheduled_total: 3,
            unscheduled_from_thought_total: 1,
            summary: "今天聚焦视觉验收与发布叙事，保持两个完整专注时段。",
            auto_planned: nil,
            planning: TodayPlanningState(
                mode: "balanced",
                effective_cap: 4,
                completed_today: 1,
                auto_fill_paused: false
            )
        )

        memories = [
            MemoryItem(
                id: "memory-candidate",
                type: "preference",
                content: "界面偏好黑白灰、高对比和克制的层级表达。",
                status: "candidate",
                source: "capture",
                confidence: 0.91,
                importance: 0.78,
                evidence: "用户多次要求灰色更纯净，背景不使用边框。",
                concepts: nil,
                concept_names: ["视觉偏好", "Aldus"]
            ),
            MemoryItem(
                id: "memory-1",
                type: "identity",
                content: "正在构建一个以理解、规划和记忆为核心的个人 AI 操作系统。",
                status: "active",
                source: "confirmed",
                confidence: 0.98,
                importance: 0.96,
                evidence: "项目愿景与长期讨论持续一致。",
                concepts: nil,
                concept_names: ["Aldus Palace", "产品愿景"]
            ),
            MemoryItem(
                id: "memory-2",
                type: "working_style",
                content: "更愿意先看到可交互原型，再根据真实感受收敛方向。",
                status: "active",
                source: "confirmed",
                confidence: 0.89,
                importance: 0.72,
                evidence: "多轮视觉方向均通过原型快速确认。",
                concepts: nil,
                concept_names: ["工作方式"]
            ),
            MemoryItem(
                id: "memory-3",
                type: "principle",
                content: "低风险整理可以自动完成，高风险外部行动必须确认。",
                status: "active",
                source: "system",
                confidence: 0.96,
                importance: 0.94,
                evidence: "产品自治规则。",
                concepts: nil,
                concept_names: ["自治", "信任"]
            )
        ]

        activity = [
            ActionLogItem(
                id: "activity-1",
                actor: "ai",
                action_type: "plan",
                summary: "将“视觉验收”安排为今天的首要事项",
                reason: "它阻塞 Mac 客户端进入下一轮产品验证。",
                created_at: "2026-07-29T01:25:00Z"
            ),
            ActionLogItem(
                id: "activity-2",
                actor: "user",
                action_type: "confirm",
                summary: "确认一条长期视觉偏好",
                reason: "该偏好在多次反馈中保持稳定。",
                created_at: "2026-07-29T01:10:00Z"
            ),
            ActionLogItem(
                id: "activity-3",
                actor: "ai",
                action_type: "organize",
                summary: "把 7 项承诺整理为 3 个工作分组",
                reason: "减少切换成本，同时不改变原始承诺。",
                created_at: "2026-07-28T13:40:00Z"
            ),
            ActionLogItem(
                id: "activity-4",
                actor: "user",
                action_type: "capture",
                summary: "记录发布叙事的新想法",
                reason: nil,
                created_at: "2026-07-28T12:05:00Z"
            )
        ]

        lastActionCard = nil
        userBanner = "Aldus 视觉预览 · 样本数据仅存在于本次 Debug 运行"
        errorMessage = nil
    }

    func previewCommitment(
        id: String,
        title: String,
        detail: String,
        projectID: String,
        groupKey: String,
        groupLabel: String,
        groupReason: String
    ) -> Commitment {
        Commitment(
            id: id,
            title: title,
            goal: nil,
            optimized_content: detail,
            status: "open",
            deadline: nil,
            window_start: nil,
            window_end: nil,
            source_thought_id: nil,
            source_input_id: nil,
            source_input_content: nil,
            project_id: projectID,
            started_at: id == "commitment-now" ? "2026-07-29T01:30:00Z" : nil,
            created_at: "2026-07-27T08:00:00Z",
            work_group_key: groupKey,
            work_group_label: groupLabel,
            work_group_source: "ai",
            work_group_reason: groupReason,
            work_group_manual_override: 0
        )
    }

    func previewTodayCommitment(
        id: String,
        title: String,
        slotStart: String?,
        slotEnd: String?,
        projectID: String,
        kind: String
    ) -> TodayCommitment {
        TodayCommitment(
            id: id,
            title: title,
            status: "open",
            deadline: nil,
            window_start: nil,
            window_end: nil,
            ai_slot_start: slotStart,
            ai_slot_end: slotEnd,
            started_at: id == "commitment-now" ? "2026-07-29T01:30:00Z" : nil,
            completed_at: nil,
            source_thought_id: nil,
            project_id: projectID,
            created_at: "2026-07-27T08:00:00Z",
            kind_label: kind
        )
    }
}
#endif

enum NavTab: String, CaseIterable, Identifiable {
    case today
    case work
    case thoughts
    case projects
    case memory
    case activity
    case capture

    var id: String { rawValue }

    var title: String {
        switch self {
        case .today: return "今日"
        case .work: return "要做"
        case .thoughts: return "想法"
        case .projects: return "项目"
        case .memory: return "记忆"
        case .activity: return "动态"
        case .capture: return "输入"
        }
    }
}
