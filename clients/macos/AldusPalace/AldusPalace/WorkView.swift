import SwiftUI

/// 要做的事 — same grammar as 今日: one column, circle + title, expand in place.
struct WorkView: View {
    @EnvironmentObject private var state: AppState
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var expandedId: String?
    @State private var showDone = false
    @State private var showFlat = false
    @AppStorage("work.expandedGroupKeys") private var expandedGroupKeysStorage = ""
    @State private var showEdit = false
    @State private var editTitle = ""
    @State private var editGoal = ""
    @State private var editTargetId: String?
    @State private var rawExpandedIds: Set<String> = []
    @State private var showDeleteConfirm = false
    @State private var deleteTargetId: String?

    private struct WorkGroup: Identifiable {
        let id: String
        let label: String
        let items: [Commitment]
    }

    private var openItems: [Commitment] {
        state.commitments.filter(\.isOpen)
    }

    private var doneItems: [Commitment] {
        state.commitments.filter {
            let s = $0.status ?? ""
            return s == "completed" || s == "cancelled"
        }
    }

    private var displayed: [Commitment] {
        showDone ? doneItems : openItems
    }

    private var projectNames: [String: String] {
        Dictionary(uniqueKeysWithValues: state.projects.map { ($0.id, $0.name) })
    }

    private var workGroups: [WorkGroup] {
        var order: [String] = []
        var labels: [String: String] = [:]
        var buckets: [String: [Commitment]] = [:]
        for commitment in openItems {
            let key = displayGroupKey(for: commitment)
            if buckets[key] == nil { order.append(key) }
            labels[key] = commitment.work_group_label
                ?? commitment.project_id.flatMap { projectNames[$0] }
                ?? "待归类"
            buckets[key, default: []].append(commitment)
        }
        let rawGroups: [WorkGroup] = order.compactMap { key -> WorkGroup? in
            guard let items = buckets[key], let label = labels[key] else { return nil }
            return WorkGroup(id: key, label: label, items: items.sorted(by: workPriority))
        }
        let orderedGroups = rawGroups.sorted { lhs, rhs in
            let left = lhs.items.first.map(priorityRank) ?? 4
            let right = rhs.items.first.map(priorityRank) ?? 4
            return left == right
                ? (order.firstIndex(of: lhs.id) ?? .max) < (order.firstIndex(of: rhs.id) ?? .max)
                : left < right
        }
        guard orderedGroups.count > 6 else { return orderedGroups }
        let retained = Array(orderedGroups.prefix(5))
        let overflowItems = orderedGroups.dropFirst(5).flatMap { $0.items }.sorted(by: workPriority)
        return retained + [WorkGroup(id: "other-work-streams", label: "其他事项", items: overflowItems)]
    }

    private func displayGroupKey(for commitment: Commitment) -> String {
        commitment.work_group_key
            ?? commitment.project_id.map { "project:\($0)" }
            ?? "unassigned"
    }

    private var usesSmartGrouping: Bool {
        !showDone && !showFlat && openItems.count >= 5 && workGroups.count > 1
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PAOS.Space.xxl) {
                header

                if let banner = state.userBanner {
                    SoftBanner(text: banner)
                }

                if displayed.isEmpty {
                    emptyBlock
                } else if usesSmartGrouping {
                    groupedWork
                } else {
                    AldusCard(padding: PAOS.Space.sm) {
                        LazyVStack(alignment: .leading, spacing: PAOS.Space.xs) {
                            ForEach(displayed) { commitment in
                                workRow(commitment)
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
            await state.refreshToday()
        }
        .sheet(isPresented: $showEdit) { editSheet }
        .onAppear {
            openRequestedCommitment()
        }
        .onChange(of: state.requestedCommitmentID) {
            openRequestedCommitment()
        }
        .confirmationDialog("删除这件事？", isPresented: $showDeleteConfirm) {
            Button("删除", role: .destructive) {
                if let id = deleteTargetId {
                    Task { await state.deleteCommitment(id: id) }
                }
            }
            Button("取消", role: .cancel) {}
        }
    }

    private func openRequestedCommitment() {
        guard let id = state.requestedCommitmentID else { return }
        expandedId = id
        state.requestedCommitmentID = nil
    }

    private var header: some View {
        AldusPageTitle(
            showDone ? "Closed work" : "Work",
            subtitle: !showDone && !openItems.isEmpty ? headerSummary : nil
        ) {
            Menu {
                Button(showDone ? "显示进行中" : "显示已结束") {
                    showDone.toggle()
                    expandedId = nil
                }
                if !showDone, workGroups.count > 1 {
                    Button(showFlat ? "使用智能分组" : "平铺显示") {
                        showFlat.toggle()
                        expandedId = nil
                    }
                }
                Button("清理重复") {
                    Task { await state.dedupeCommitments() }
                }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .font(PAOS.TypeScale.bodyLarge)
                    .foregroundStyle(PAOS.ColorToken.secondaryText)
                    .frame(width: 36, height: 36)
            }
            .menuStyle(.borderlessButton)
            .help("更多")
        }
    }

    private var headerSummary: String {
        if state.isClassifyingWork { return "正在整理工作脉络…" }
        if usesSmartGrouping {
            return "\(openItems.count) 件，集中在 \(workGroups.count) 条工作脉络"
        }
        return "\(openItems.count) 件"
    }

    private var groupedWork: some View {
        LazyVStack(alignment: .leading, spacing: PAOS.Space.xxl) {
            ForEach(workGroups) { group in
                workGroupSection(group)
            }
        }
    }

    private func workGroupSection(_ group: WorkGroup) -> some View {
        let expanded = isGroupExpanded(group.id)
        let visible = expanded ? group.items : Array(group.items.prefix(3))
        let remaining = max(0, group.items.count - visible.count)

        return AldusCard(padding: PAOS.Space.sm) {
            VStack(alignment: .leading, spacing: PAOS.Space.xs) {
                HStack(alignment: .firstTextBaseline) {
                    Text(group.label.aldusTypeset)
                        .font(PAOS.TypeScale.section)
                        .foregroundStyle(PAOS.ColorToken.secondaryText)
                    Spacer()
                    Text("\(group.items.count)")
                        .font(PAOS.TypeScale.caption.monospacedDigit())
                        .foregroundStyle(PAOS.ColorToken.tertiaryText)
                }
                .padding(.horizontal, PAOS.Space.md)
                .padding(.top, PAOS.Space.sm)
                .padding(.bottom, PAOS.Space.xs)

                ForEach(visible) { commitment in
                    workRow(commitment)
                }

                if remaining > 0 {
                    Button("还有 \(remaining) 件") {
                        setGroupExpanded(group.id, true)
                    }
                    .buttonStyle(PAOSGhostButtonStyle())
                    .padding(.leading, 42)
                } else if expanded, group.items.count > 3 {
                    Button("收起") {
                        setGroupExpanded(group.id, false)
                    }
                    .buttonStyle(PAOSGhostButtonStyle())
                    .padding(.leading, 42)
                }
            }
        }
    }

    private var emptyBlock: some View {
        AldusEmptyCard(
            title: showDone ? "还没有已结束的" : "还没有要做的事",
            description: showDone ? "完成后会出现在这里。" : "有事就去「输入」说一句，不用分类。",
            systemImage: showDone ? "archivebox" : "checkmark.circle",
            actionTitle: showDone ? nil : "记一点",
            action: showDone ? nil : { state.selectedTab = .capture }
        )
    }

    @ViewBuilder
    private func workRow(_ c: Commitment) -> some View {
        let open = expandedId == c.id

        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                Button {
                    if c.isOpen {
                        Task { await state.completeCommitment(c.id) }
                    }
                } label: {
                    Image(systemName: c.isOpen ? "circle" : "checkmark.circle.fill")
                        .font(PAOS.TypeScale.bodyLarge)
                        .foregroundStyle(c.isOpen ? PAOS.ColorToken.secondaryText : PAOS.ColorToken.success)
                        .frame(width: 34, height: 34)
                }
                .buttonStyle(.quiet)
                .help("完成")
                .accessibilityLabel(c.isOpen ? "完成\(c.title)" : "\(c.title)已完成")

                Button {
                    withAnimation(reduceMotion ? nil : .easeOut(duration: 0.16)) {
                        expandedId = open ? nil : c.id
                    }
                } label: {
                    Text(c.title.aldusTypeset)
                        .font(PAOS.TypeScale.readingBody)
                        .foregroundStyle(c.isOpen ? PAOS.ColorToken.primaryText : PAOS.ColorToken.secondaryText)
                        .strikethrough(!c.isOpen && c.status == "completed")
                        .lineSpacing(5)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, minHeight: 40, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.quiet)
            }

            if open {
                if let content = c.optimizedContent {
                    Text(content.aldusTypeset)
                        .font(PAOS.TypeScale.readingBody)
                        .foregroundStyle(PAOS.ColorToken.primaryText)
                        .lineSpacing(6)
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.leading, 32)
                }

                if let raw = c.rawInputText {
                    Button {
                        if rawExpandedIds.contains(c.id) {
                            rawExpandedIds.remove(c.id)
                        } else {
                            rawExpandedIds.insert(c.id)
                        }
                    } label: {
                        HStack(spacing: 5) {
                            Text(rawExpandedIds.contains(c.id) ? "收起原文" : "查看原文")
                            Image(systemName: rawExpandedIds.contains(c.id) ? "chevron.up" : "chevron.down")
                                .font(PAOS.TypeScale.caption2)
                        }
                        .font(PAOS.TypeScale.caption)
                        .foregroundStyle(PAOS.ColorToken.secondaryText)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                    }
                    .buttonStyle(.quiet)
                    .padding(.horizontal, -6)
                    .padding(.leading, 32)

                    if rawExpandedIds.contains(c.id) {
                        Text(raw.aldusTypeset)
                            .font(PAOS.TypeScale.callout)
                            .foregroundStyle(PAOS.ColorToken.secondaryText)
                            .lineSpacing(5)
                            .textSelection(.enabled)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.leading, 32)
                    }
                }

                if c.isOpen {
                    HStack(spacing: 10) {
                        Button("完成") {
                            Task { await state.completeCommitment(c.id) }
                        }
                        .buttonStyle(PAOSPrimaryButtonStyle())

                        Button("开始") {
                            Task { await state.startCommitment(c.id) }
                        }
                        .buttonStyle(PAOSSecondaryButtonStyle())

                        Button(isScheduledToday(c.id) ? "移出今天" : "安排今天") {
                            Task {
                                if isScheduledToday(c.id) {
                                    await state.removeFromToday(c.id)
                                } else {
                                    await state.arrangeToday(c.id)
                                }
                            }
                        }
                        .buttonStyle(PAOSSecondaryButtonStyle())

                        Spacer(minLength: 8)
                        rowMoreMenu(c)
                    }
                    .padding(.leading, 32)
                    .transition(.opacity)
                } else {
                    HStack {
                        Text(L10n.Labels.commitmentStatus(c.status ?? ""))
                            .font(PAOS.TypeScale.subheadline)
                            .foregroundStyle(PAOS.ColorToken.secondaryText)
                        Spacer()
                        Button("编辑") {
                            beginEditing(c)
                        }
                        .buttonStyle(.quiet)
                        .font(PAOS.TypeScale.subheadline)
                        .foregroundStyle(PAOS.ColorToken.secondaryText)

                        Button("删除", role: .destructive) {
                            deleteTargetId = c.id
                            showDeleteConfirm = true
                        }
                        .buttonStyle(.quiet)
                        .font(PAOS.TypeScale.subheadline)
                    }
                    .padding(.leading, 32)
                }
            }
        }
        .padding(.horizontal, PAOS.Space.sm)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: PAOS.Radius.md, style: .continuous)
                .fill(open ? PAOS.ColorToken.surfaceRaised : .clear)
        )
        .contentShape(Rectangle())
    }

    private func rowMoreMenu(_ commitment: Commitment) -> some View {
        Menu {
            let currentKey = displayGroupKey(for: commitment)
            let choices = workGroups.filter { group in
                group.id != currentKey &&
                    group.id != "other-work-streams" &&
                    group.items.contains { $0.project_id == commitment.project_id }
            }
            if usesSmartGrouping, !choices.isEmpty {
                Menu("分组不对") {
                    ForEach(choices) { group in
                        Button(group.label) {
                            Task {
                                await state.overrideCommitmentClassification(
                                    id: commitment.id,
                                    groupKey: group.id
                                )
                            }
                        }
                    }
                }
                Divider()
            }
            Button("编辑") { beginEditing(commitment) }
            Button("删除", role: .destructive) {
                deleteTargetId = commitment.id
                showDeleteConfirm = true
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(PAOS.TypeScale.subheadline)
                .foregroundStyle(PAOS.ColorToken.secondaryText)
                .padding(6)
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
        .help("更多")
    }

    private func priorityRank(_ commitment: Commitment) -> Int {
        if commitment.status == "risk" { return 0 }
        if commitment.started_at != nil { return 1 }
        if commitment.deadline != nil { return 2 }
        return 3
    }

    private func workPriority(_ lhs: Commitment, _ rhs: Commitment) -> Bool {
        let left = priorityRank(lhs)
        let right = priorityRank(rhs)
        if left != right { return left < right }
        if let leftDeadline = parseDate(lhs.deadline), let rightDeadline = parseDate(rhs.deadline),
           leftDeadline != rightDeadline
        {
            return leftDeadline < rightDeadline
        }
        return (lhs.created_at ?? "") > (rhs.created_at ?? "")
    }

    private func parseDate(_ value: String?) -> Date? {
        guard let value else { return nil }
        if let date = ISO8601DateFormatter().date(from: value) { return date }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: value)
    }

    private func isGroupExpanded(_ key: String) -> Bool {
        Set(expandedGroupKeysStorage.split(separator: "\n").map(String.init)).contains(key)
    }

    private func setGroupExpanded(_ key: String, _ expanded: Bool) {
        var keys = Set(expandedGroupKeysStorage.split(separator: "\n").map(String.init))
        if expanded { keys.insert(key) } else { keys.remove(key) }
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.16)) {
            expandedGroupKeysStorage = keys.sorted().joined(separator: "\n")
        }
    }

    private var editSheet: some View {
        EditSheetChrome(
            title: "编辑",
            canSave: !editTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            isBusy: state.isBusy,
            onCancel: { showEdit = false },
            onSave: {
                guard let id = editTargetId else { return }
                Task {
                    await state.updateCommitment(
                        id: id,
                        title: editTitle.trimmingCharacters(in: .whitespacesAndNewlines),
                        optimizedContent: editGoal.trimmingCharacters(in: .whitespacesAndNewlines)
                    )
                    showEdit = false
                }
            }
        ) {
            VStack(alignment: .leading, spacing: 6) {
                TextField("标题", text: $editTitle)
                    .textFieldStyle(.plain)
                    .font(PAOS.TypeScale.body)
                    .padding(PAOS.Space.md)
                    .background(
                        RoundedRectangle(cornerRadius: PAOS.Radius.md, style: .continuous)
                            .fill(PAOS.ColorToken.surfaceMuted)
                    )
                Text("优化内容")
                    .font(PAOS.TypeScale.caption)
                    .foregroundStyle(PAOS.ColorToken.secondaryText)
                TextEditor(text: $editGoal)
                    .font(PAOS.TypeScale.body)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 150)
                    .padding(PAOS.Space.sm)
                    .background(
                        RoundedRectangle(cornerRadius: PAOS.Radius.md, style: .continuous)
                            .fill(PAOS.ColorToken.surfaceMuted)
                    )
            }
        }
        .frame(width: 480, height: 300)
    }

    private func beginEditing(_ commitment: Commitment) {
        editTargetId = commitment.id
        editTitle = commitment.title
        editGoal = commitment.optimizedContent ?? ""
        showEdit = true
    }

    private func isScheduledToday(_ id: String) -> Bool {
        state.today?.containsCommitment(id: id) == true
    }
}
