import SwiftUI

// MARK: - 想法 — reading list, expand in place (Notes-quiet)

struct ThoughtsView: View {
    @EnvironmentObject private var state: AppState
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var expandedId: String?
    @State private var showConverted = false
    @State private var showEdit = false
    @State private var editTitle = ""
    @State private var editContent = ""
    @State private var editTargetId: String?
    @State private var showDeleteConfirm = false
    @State private var deleteTargetId: String?
    @State private var showRaw = false

    private var items: [Thought] {
        if showConverted { return state.thoughts }
        return state.thoughts.filter { $0.status != "converted" }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PAOS.Space.xxl) {
                header

                if items.isEmpty {
                    emptyBlock
                } else {
                    AldusCard(padding: PAOS.Space.sm) {
                        LazyVStack(alignment: .leading, spacing: PAOS.Space.xs) {
                            ForEach(items) { thought in
                                thoughtRow(thought)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, PAOS.Space.page)
            .padding(.top, 70)
            .padding(.bottom, PAOS.Space.xxxl)
            .frame(maxWidth: PAOS.Space.contentMax, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(PAOS.ColorToken.canvas)
        .refreshable { await state.refreshLists() }
        .sheet(isPresented: $showEdit) { editSheet }
        .confirmationDialog("删除这条想法？", isPresented: $showDeleteConfirm) {
            Button("删除", role: .destructive) {
                if let id = deleteTargetId {
                    Task { await state.deleteThought(id: id) }
                }
            }
            Button("取消", role: .cancel) {}
        }
    }

    private var header: some View {
        AldusPageTitle(
            "Thoughts",
            subtitle: items.isEmpty ? nil : "\(items.count) thoughts still taking shape"
        ) {
            Menu {
                Button(showConverted ? "隐藏已处理" : "显示已处理") {
                    showConverted.toggle()
                    expandedId = nil
                }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .font(PAOS.TypeScale.bodyLarge)
                    .foregroundStyle(PAOS.ColorToken.secondaryText)
                    .frame(width: 36, height: 36)
            }
            .menuStyle(.borderlessButton)
                    .help("More")
        }
    }

    private var emptyBlock: some View {
        AldusEmptyCard(
            title: "还没有想法",
            description: "有感触时，去「输入」说一句就好。",
            systemImage: "lightbulb",
            actionTitle: "记一点",
            action: { state.selectedTab = .capture }
        )
    }

    @ViewBuilder
    private func thoughtRow(_ t: Thought) -> some View {
        let open = expandedId == t.id

        VStack(alignment: .leading, spacing: 12) {
            Button {
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.16)) {
                    if open {
                        expandedId = nil
                        showRaw = false
                    } else {
                        expandedId = t.id
                        showRaw = false
                    }
                }
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(t.displayTitle.aldusTypeset)
                        .font(PAOS.TypeScale.readingBody)
                        .foregroundStyle(PAOS.ColorToken.primaryText)
                        .lineSpacing(5)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if !open {
                        if let c = t.created_at {
                            Text(HumanDate.format(c))
                                .font(PAOS.TypeScale.caption)
                                .foregroundStyle(PAOS.ColorToken.tertiaryText)
                        }
                    }
                }
                .padding(.horizontal, 6)
                .padding(.vertical, 4)
            }
            .buttonStyle(.quiet)
            .padding(.horizontal, -6)

            if open {
                VStack(alignment: .leading, spacing: 16) {
                    Text(t.content.aldusTypeset)
                        .font(PAOS.TypeScale.readingBody)
                        .lineSpacing(6)
                        .textSelection(.enabled)
                        .foregroundStyle(PAOS.ColorToken.primaryText)

                    if let raw = t.rawInputText, t.hasDistinctRawInput {
                        DisclosureGroup("原文", isExpanded: $showRaw) {
                            Text(raw.aldusTypeset)
                                .font(PAOS.TypeScale.callout)
                                .foregroundStyle(PAOS.ColorToken.secondaryText)
                                .lineSpacing(5)
                                .textSelection(.enabled)
                                .padding(.top, 6)
                        }
                        .font(PAOS.TypeScale.subheadline)
                    }

                    if t.hasLinkedOpenWork(in: state.commitments) {
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(PAOS.ColorToken.success)
                                .accessibilityHidden(true)
                            Text("已有对应的要做的事")
                                .font(PAOS.TypeScale.subheadline)
                            Spacer()
                            Button("查看") {
                                state.selectedTab = .work
                            }
                            .buttonStyle(PAOSSecondaryButtonStyle())
                        }
                        .padding(14)
                        .background(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(PAOS.ColorToken.surfaceMuted)
                        )
                    } else if t.status != "converted" {
                        Button("转为要做的事") {
                            Task { await state.convertThoughtToCommitment(t.id) }
                        }
                        .buttonStyle(PAOSPrimaryButtonStyle())
                    }

                    HStack(spacing: 20) {
                        Button("编辑") {
                            editTargetId = t.id
                            editTitle = t.title ?? t.displayTitle
                            editContent = t.content
                            showEdit = true
                        }
                        Button("删除", role: .destructive) {
                            deleteTargetId = t.id
                            showDeleteConfirm = true
                        }
                        Spacer()
                        if let c = t.created_at {
                            Text(HumanDate.format(c))
                                .font(PAOS.TypeScale.caption)
                                .foregroundStyle(PAOS.ColorToken.tertiaryText)
                        }
                    }
                    .font(PAOS.TypeScale.subheadline)
                    .buttonStyle(.quiet)
                }
                .transition(.opacity)
            }
        }
        .padding(.horizontal, PAOS.Space.sm)
        .padding(.vertical, 7)
        .background(
            RoundedRectangle(cornerRadius: PAOS.Radius.md, style: .continuous)
                .fill(open ? PAOS.ColorToken.surfaceRaised : .clear)
        )
    }

    private var editSheet: some View {
        EditSheetChrome(
            title: "编辑",
            canSave: !editContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            isBusy: state.isBusy,
            onCancel: { showEdit = false },
            onSave: {
                guard let id = editTargetId else { return }
                Task {
                    let title = editTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                    await state.updateThought(
                        id: id,
                        title: title.isEmpty ? nil : title,
                        content: editContent.trimmingCharacters(in: .whitespacesAndNewlines)
                    )
                    showEdit = false
                }
            }
        ) {
            VStack(alignment: .leading, spacing: 12) {
                TextField("标题", text: $editTitle)
                    .textFieldStyle(.plain)
                    .font(PAOS.TypeScale.body)
                    .padding(PAOS.Space.md)
                    .background(
                        RoundedRectangle(cornerRadius: PAOS.Radius.md, style: .continuous)
                            .fill(PAOS.ColorToken.surfaceMuted)
                    )
                TextEditor(text: $editContent)
                    .font(PAOS.TypeScale.body)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 120)
                    .padding(PAOS.Space.sm)
                    .background(
                        RoundedRectangle(cornerRadius: PAOS.Radius.md, style: .continuous)
                            .fill(PAOS.ColorToken.surfaceMuted)
                    )
            }
        }
        .frame(width: 440, height: 280)
    }
}

func thoughtTypeLabel(_ t: String) -> String { L10n.Labels.thoughtType(t) }
func thoughtStatusLabel(_ s: String) -> String { L10n.Labels.thoughtStatus(s) }

// MARK: - 记忆 — candidates as Capture-style cards, then quiet list

struct MemoryView: View {
    @EnvironmentObject private var state: AppState
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var showEdit = false
    @State private var editContent = ""
    @State private var editTargetId: String?
    @State private var showDeleteConfirm = false
    @State private var deleteTargetId: String?
    @State private var expandedActiveId: String?

    private var candidates: [MemoryItem] {
        state.memories.filter { $0.status == "candidate" }
    }

    private var active: [MemoryItem] {
        state.memories.filter { $0.status == "active" }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PAOS.Space.xxl) {
                AldusPageTitle(
                    "Memory, with evidence.",
                    subtitle: memorySummary
                )

                if candidates.isEmpty && active.isEmpty {
                    emptyBlock
                } else {
                    if !candidates.isEmpty {
                        VStack(alignment: .leading, spacing: PAOS.Space.md) {
                            Text("要不要记住")
                                .font(PAOS.TypeScale.section)
                                .foregroundStyle(PAOS.ColorToken.secondaryText)

                            ForEach(candidates) { m in
                                candidateCard(m)
                            }
                        }
                    }

                    if !active.isEmpty {
                        VStack(alignment: .leading, spacing: PAOS.Space.md) {
                            Text("已记住")
                                .font(PAOS.TypeScale.section)
                                .foregroundStyle(PAOS.ColorToken.secondaryText)

                            AldusCard(padding: PAOS.Space.sm) {
                                LazyVStack(alignment: .leading, spacing: PAOS.Space.xs) {
                                    ForEach(active) { memory in
                                        activeRow(memory)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, PAOS.Space.page)
            .padding(.top, 70)
            .padding(.bottom, PAOS.Space.xxxl)
            .frame(maxWidth: PAOS.Space.contentMax, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(PAOS.ColorToken.canvas)
        .refreshable {
            await state.refreshLists()
            await state.refreshConcepts()
        }
        .task { await state.refreshConcepts() }
        .sheet(isPresented: $showEdit) { editSheet }
        .confirmationDialog("删除这条记忆？", isPresented: $showDeleteConfirm) {
            Button("删除", role: .destructive) {
                if let id = deleteTargetId {
                    Task { await state.deleteMemory(id: id) }
                }
            }
            Button("取消", role: .cancel) {}
        }
    }

    private var memorySummary: String? {
        if candidates.isEmpty && active.isEmpty { return nil }
        if candidates.isEmpty { return "\(active.count) long-term memories" }
        return "\(active.count) confirmed · \(candidates.count) awaiting a decision"
    }

    private var emptyBlock: some View {
        AldusEmptyCard(
            title: "还没有记忆",
            description: "系统只会记下稳定的偏好和原则，不会把闲聊当记忆。",
            systemImage: "brain",
            actionTitle: "记一点",
            action: { state.selectedTab = .capture }
        )
    }

    private func candidateCard(_ m: MemoryItem) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: PAOS.Space.sm) {
                KindChip(text: memoryTypeLabel(m.type))
                if let confidence = m.confidence {
                    Text("置信度 \(Int((confidence * 100).rounded()))%")
                        .font(PAOS.TypeScale.caption)
                        .foregroundStyle(PAOS.ColorToken.tertiaryText)
                }
            }

            Text(m.content.aldusTypeset)
                .font(PAOS.TypeScale.readingBody)
                .lineSpacing(6)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)

            Text("确认后，之后会参考这条。")
                .font(PAOS.TypeScale.subheadline)
                .foregroundStyle(PAOS.ColorToken.secondaryText)

            HStack(spacing: 10) {
                Button("记住") {
                    Task { await state.confirmMemory(m.id) }
                }
                .buttonStyle(PAOSPrimaryButtonStyle())

                Button("不用") {
                    Task { await state.rejectMemory(m.id) }
                }
                .buttonStyle(PAOSSecondaryButtonStyle())

                Spacer()
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(PAOS.ColorToken.surface)
        )
        .aldusCardShadow(radius: 10, y: 3)
    }

    @ViewBuilder
    private func activeRow(_ m: MemoryItem) -> some View {
        let open = expandedActiveId == m.id

        VStack(alignment: .leading, spacing: 10) {
            Button {
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.16)) {
                    expandedActiveId = open ? nil : m.id
                }
            } label: {
                VStack(alignment: .leading, spacing: PAOS.Space.sm) {
                    HStack {
                        KindChip(text: memoryTypeLabel(m.type))
                        Spacer()
                        if let source = m.source, !source.isEmpty {
                            Text(source)
                                .font(PAOS.TypeScale.caption)
                                .foregroundStyle(PAOS.ColorToken.tertiaryText)
                                .lineLimit(1)
                        }
                    }
                    Text(m.content.aldusTypeset)
                        .font(PAOS.TypeScale.readingBody)
                        .foregroundStyle(PAOS.ColorToken.primaryText)
                        .lineSpacing(6)
                        .multilineTextAlignment(.leading)
                        .lineLimit(open ? nil : 3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, minHeight: 42, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.quiet)

            if open {
                if let evidence = m.evidence, !evidence.isEmpty {
                    Text(evidence.aldusTypeset)
                        .font(PAOS.TypeScale.callout)
                        .foregroundStyle(PAOS.ColorToken.secondaryText)
                        .lineSpacing(5)
                        .textSelection(.enabled)
                }

                HStack(spacing: PAOS.Space.sm) {
                    Button("编辑") {
                        editTargetId = m.id
                        editContent = m.content
                        showEdit = true
                    }
                    Button("删除", role: .destructive) {
                        deleteTargetId = m.id
                        showDeleteConfirm = true
                    }
                    Spacer()
                }
                .buttonStyle(PAOSGhostButtonStyle())
                .transition(.opacity)
            }
        }
        .padding(.horizontal, PAOS.Space.sm)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: PAOS.Radius.md, style: .continuous)
                .fill(open ? PAOS.ColorToken.surfaceRaised : .clear)
        )
    }

    private var editSheet: some View {
        EditSheetChrome(
            title: "编辑",
            canSave: !editContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            isBusy: state.isBusy,
            onCancel: { showEdit = false },
            onSave: {
                guard let id = editTargetId else { return }
                Task {
                    await state.updateMemory(
                        id: id,
                        content: editContent.trimmingCharacters(in: .whitespacesAndNewlines)
                    )
                    showEdit = false
                }
            }
        ) {
            TextEditor(text: $editContent)
                .font(PAOS.TypeScale.body)
                .scrollContentBackground(.hidden)
                .padding(PAOS.Space.sm)
                .background(
                    RoundedRectangle(cornerRadius: PAOS.Radius.md, style: .continuous)
                        .fill(PAOS.ColorToken.surfaceMuted)
                )
        }
        .frame(width: 420, height: 240)
    }
}

func memoryTypeLabel(_ t: String) -> String { L10n.Labels.memoryType(t) }

// MARK: - 动态 — day log, same quiet rhythm as 今日

struct ActivityView: View {
    @EnvironmentObject private var state: AppState

    private var sections: [(day: String, items: [ActionLogItem])] {
        let grouped = Dictionary(grouping: state.activity) { HumanDate.daySection($0.created_at) }
        var seen = Set<String>()
        var days: [String] = []
        for item in state.activity {
            let d = HumanDate.daySection(item.created_at)
            if seen.insert(d).inserted { days.append(d) }
        }
        return days.map { ($0, grouped[$0] ?? []) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PAOS.Space.xxl) {
                AldusPageTitle(
                    "Activity",
                    subtitle: state.activity.isEmpty ? nil : "\(state.activity.count) recent explainable events"
                )

                if state.activity.isEmpty {
                    AldusEmptyCard(
                        title: "还没有动态",
                        description: "使用后，这里会出现系统理解和用户操作的简要记录。",
                        systemImage: "clock.arrow.circlepath"
                    )
                } else {
                    ForEach(sections, id: \.day) { section in
                        VStack(alignment: .leading, spacing: PAOS.Space.md) {
                            Text(section.day)
                                .font(PAOS.TypeScale.section)
                                .foregroundStyle(PAOS.ColorToken.secondaryText)

                            AldusCard(padding: PAOS.Space.sm) {
                                LazyVStack(alignment: .leading, spacing: PAOS.Space.xs) {
                                    ForEach(section.items) { item in
                                        activityRow(item)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, PAOS.Space.page)
            .padding(.top, 70)
            .padding(.bottom, PAOS.Space.xxxl)
            .frame(maxWidth: PAOS.Space.contentMax, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(PAOS.ColorToken.canvas)
        .refreshable { await state.refreshLists() }
    }

    private func activityRow(_ item: ActionLogItem) -> some View {
        HStack(alignment: .top, spacing: PAOS.Space.md) {
            Image(systemName: ActivityCopy.systemImage(item.action_type, actor: item.actor))
                .font(PAOS.TypeScale.subheadline)
                .foregroundStyle(PAOS.ColorToken.secondaryText)
                .frame(width: 32, height: 32)
                .background(
                    Circle()
                        .fill(PAOS.ColorToken.surfaceMuted)
                )
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                Text(L10n.Activity.displaySummary(
                    actionType: item.action_type,
                    summary: item.summary
                ).aldusTypeset)
                .font(PAOS.TypeScale.readingBody)
                .foregroundStyle(PAOS.ColorToken.primaryText)
                .lineSpacing(5)
                .fixedSize(horizontal: false, vertical: true)

                if let reason = item.reason, !reason.isEmpty {
                    Text(reason.aldusTypeset)
                        .font(PAOS.TypeScale.caption)
                        .foregroundStyle(PAOS.ColorToken.secondaryText)
                        .lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Spacer(minLength: PAOS.Space.sm)

            if let createdAt = item.created_at {
                Text(shortTime(createdAt))
                    .font(PAOS.TypeScale.caption.monospacedDigit())
                    .foregroundStyle(PAOS.ColorToken.tertiaryText)
            }
        }
        .padding(.horizontal, PAOS.Space.sm)
        .padding(.vertical, PAOS.Space.md)
    }

    private func shortTime(_ iso: String) -> String {
        if iso.count >= 16 {
            let s = String(iso.dropFirst(11).prefix(5))
            if s.contains(":") { return s }
        }
        return HumanDate.format(iso)
    }
}

// Shared helper (projects / chips)
struct FlowChips: View {
    let items: [String]
    var color: Color = .secondary
    var body: some View {
        HStack(spacing: 6) {
            ForEach(items.prefix(8), id: \.self) { name in
                KindChip(text: name, color: color)
            }
        }
    }
}
