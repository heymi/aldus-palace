import SwiftUI

/// 项目 — name list + one calm brief surface (not an admin console).
struct ProjectsView: View {
    @EnvironmentObject private var state: AppState
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var expandedId: String?
    @State private var showCreate = false
    @State private var showEdit = false
    @State private var showDeleteConfirm = false
    @State private var deleteTargetId: String?

    @State private var nameField = ""
    @State private var descField = ""
    @State private var briefField = ""
    @State private var aliasesField = ""
    @State private var editTargetId: String?

    @State private var detail: ProjectDetail?
    @State private var loadingDetail = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PAOS.Space.xxl) {
                header

                if state.projects.isEmpty {
                    emptyBlock
                } else {
                    AldusCard(padding: PAOS.Space.sm) {
                        LazyVStack(alignment: .leading, spacing: PAOS.Space.xs) {
                            ForEach(state.projects) { project in
                                projectRow(project)
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
        .task { await state.refreshProjects() }
        .sheet(isPresented: $showCreate) { createSheet }
        .sheet(isPresented: $showEdit) { editSheet }
        .confirmationDialog("删除这个项目？", isPresented: $showDeleteConfirm) {
            Button("删除", role: .destructive) {
                if let id = deleteTargetId {
                    Task {
                        await state.deleteProject(id: id)
                        if expandedId == id { expandedId = nil }
                    }
                }
            }
            Button("取消", role: .cancel) {}
        } message: {
            Text("相关想法与事项会保留，只是不再归在此项目下显示。")
        }
    }

    private var header: some View {
        AldusPageTitle(
            "Projects",
            subtitle: state.projects.isEmpty ? nil : "\(state.projects.count) context spaces"
        ) {
            Button {
                nameField = ""; descField = ""; briefField = ""; aliasesField = ""
                showCreate = true
            } label: {
                Image(systemName: "plus")
                    .font(PAOS.TypeScale.bodyLarge)
                    .foregroundStyle(PAOS.ColorToken.primaryText)
                    .frame(width: 36, height: 36)
                    .background(
                        Circle()
                            .fill(PAOS.ColorToken.surfaceMuted)
                    )
            }
            .buttonStyle(.quiet)
            .help("新建")
            .accessibilityLabel("新建项目")
        }
    }

    private var emptyBlock: some View {
        AldusEmptyCard(
            title: "还没有项目",
            description: "给正在做的事起个名字，之后输入会自动归类。",
            systemImage: "folder",
            actionTitle: "新建",
            action: {
                nameField = ""; descField = ""; briefField = ""; aliasesField = ""
                showCreate = true
            }
        )
    }

    @ViewBuilder
    private func projectRow(_ p: ProjectItem) -> some View {
        let open = expandedId == p.id

        VStack(alignment: .leading, spacing: 14) {
            Button {
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.16)) {
                    if open {
                        expandedId = nil
                        detail = nil
                    } else {
                        expandedId = p.id
                        Task { await loadDetail(p.id) }
                    }
                }
            } label: {
                HStack(alignment: .firstTextBaseline) {
                    Text(p.name.aldusTypeset)
                        .font(PAOS.TypeScale.readingBody)
                        .foregroundStyle(PAOS.ColorToken.primaryText)
                        .lineSpacing(5)
                    Spacer()
                    if let d = p.description, !d.isEmpty, !open {
                        Text(d.aldusTypeset)
                            .font(PAOS.TypeScale.caption)
                            .foregroundStyle(PAOS.ColorToken.tertiaryText)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 6)
                .padding(.vertical, 4)
            }
            .buttonStyle(.quiet)
            .padding(.horizontal, -6)

            if open {
                VStack(alignment: .leading, spacing: 16) {
                    if let d = p.description, !d.isEmpty {
                        Text(d.aldusTypeset)
                            .font(PAOS.TypeScale.subheadline)
                            .foregroundStyle(PAOS.ColorToken.secondaryText)
                            .lineSpacing(4)
                    }

                    // Brief — only rich block
                    VStack(alignment: .leading, spacing: 8) {
                        Text("背景")
                            .font(PAOS.TypeScale.section)
                            .foregroundStyle(PAOS.ColorToken.secondaryText)
                        if let b = p.brief?.trimmingCharacters(in: .whitespacesAndNewlines), !b.isEmpty {
                            Text(b.aldusTypeset)
                                .font(PAOS.TypeScale.readingBody)
                                .lineSpacing(6)
                                .textSelection(.enabled)
                        } else {
                            Text("还没有背景。写清楚是什么、给谁用，之后判断会更准。")
                                .font(PAOS.TypeScale.subheadline)
                                .foregroundStyle(PAOS.ColorToken.secondaryText)
                            Button("添加背景") {
                                fillEdit(from: p)
                                showEdit = true
                            }
                            .buttonStyle(PAOSSecondaryButtonStyle())
                        }
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(PAOS.ColorToken.surfaceMuted)
                    )

                    if loadingDetail && detail == nil {
                        ProgressView().controlSize(.small)
                    } else if let detail {
                        HStack(spacing: 16) {
                            if !detail.thoughts.isEmpty {
                                linkChip("想法 \(detail.thoughts.count)") {
                                    state.selectedTab = .thoughts
                                }
                            }
                            if !detail.commitments.isEmpty {
                                linkChip("要做 \(detail.commitments.count)") {
                                    state.selectedTab = .work
                                }
                            }
                        }
                    }

                    HStack(spacing: 20) {
                        Button("编辑") {
                            fillEdit(from: p)
                            showEdit = true
                        }
                        Button("关联未归类") {
                            Task {
                                await state.relinkProject(p.id)
                                await loadDetail(p.id)
                            }
                        }
                        Button("删除", role: .destructive) {
                            deleteTargetId = p.id
                            showDeleteConfirm = true
                        }
                        Spacer()
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

    private func linkChip(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Text(title)
                    .font(PAOS.TypeScale.subheadline)
                Image(systemName: "chevron.right")
                    .font(PAOS.TypeScale.caption2)
                    .foregroundStyle(PAOS.ColorToken.tertiaryText)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(PAOS.ColorToken.surfaceMuted)
            )
        }
        .buttonStyle(.quiet)
    }

    private func fillEdit(from p: ProjectItem) {
        editTargetId = p.id
        nameField = p.name
        descField = p.description ?? ""
        briefField = p.brief ?? ""
        aliasesField = prettyAliases(p.aliases ?? "")
    }

    private func prettyAliases(_ raw: String) -> String {
        let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return "" }
        if t.hasPrefix("["),
           let data = t.data(using: .utf8),
           let arr = try? JSONDecoder().decode([String].self, from: data) {
            return arr.joined(separator: ", ")
        }
        return t
    }

    private func loadDetail(_ id: String) async {
        loadingDetail = true
        defer { loadingDetail = false }
        if state.isVisualPreview,
           let project = state.projects.first(where: { $0.id == id }) {
            detail = ProjectDetail(
                project: project,
                thoughts: state.thoughts.filter { $0.project_id == id },
                commitments: state.commitments.filter { $0.project_id == id }
            )
            return
        }
        detail = try? await state.client.projectDetail(id: id)
    }

    private var createSheet: some View {
        formSheet(title: "新建项目", saveTitle: "创建") {
            Task {
                let aliases = aliasesField
                    .split(separator: ",")
                    .map { $0.trimmingCharacters(in: .whitespaces) }
                    .filter { !$0.isEmpty }
                let brief = briefField.trimmingCharacters(in: .whitespacesAndNewlines)
                if let p = await state.createProject(
                    name: nameField,
                    description: descField.isEmpty ? nil : descField,
                    brief: brief.isEmpty ? nil : brief,
                    aliases: aliases
                ) {
                    showCreate = false
                    expandedId = p.id
                    await loadDetail(p.id)
                }
            }
        }
    }

    private var editSheet: some View {
        formSheet(title: "编辑项目", saveTitle: "存储") {
            guard let id = editTargetId else { return }
            Task {
                let aliases = aliasesField
                    .split(separator: ",")
                    .map { $0.trimmingCharacters(in: .whitespaces) }
                    .filter { !$0.isEmpty }
                let desc = descField.trimmingCharacters(in: .whitespacesAndNewlines)
                let brief = briefField.trimmingCharacters(in: .whitespacesAndNewlines)
                await state.updateProject(
                    id: id,
                    name: nameField.trimmingCharacters(in: .whitespacesAndNewlines),
                    description: desc.isEmpty ? nil : desc,
                    brief: brief.isEmpty ? nil : brief,
                    aliases: aliases
                )
                showEdit = false
                await state.refreshProjects()
                if expandedId == id {
                    await loadDetail(id)
                }
            }
        }
    }

    private func formSheet(title: String, saveTitle: String, onSave: @escaping () -> Void) -> some View {
        EditSheetChrome(
            title: title,
            saveTitle: saveTitle,
            canSave: !nameField.trimmingCharacters(in: .whitespaces).isEmpty,
            isBusy: state.isBusy,
            onCancel: {
                showCreate = false
                showEdit = false
            },
            onSave: onSave
        ) {
            VStack(alignment: .leading, spacing: PAOS.Space.lg) {
                projectField("名称") {
                    TextField("项目名称", text: $nameField)
                }
                projectField("简介") {
                    TextField("一句话说明这个项目", text: $descField)
                }
                projectField("别名") {
                    TextField("用逗号分隔", text: $aliasesField)
                }
                VStack(alignment: .leading, spacing: PAOS.Space.sm) {
                    FormFieldLabel(text: "背景")
                    TextEditor(text: $briefField)
                        .font(PAOS.TypeScale.body)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 100)
                        .padding(PAOS.Space.sm)
                        .background(
                            RoundedRectangle(cornerRadius: PAOS.Radius.md, style: .continuous)
                                .fill(PAOS.ColorToken.surfaceMuted)
                        )
                }
            }
        }
        .frame(width: 440, height: 420)
    }

    private func projectField<Field: View>(
        _ label: String,
        @ViewBuilder field: () -> Field
    ) -> some View {
        VStack(alignment: .leading, spacing: PAOS.Space.sm) {
            FormFieldLabel(text: label)
            field()
                .textFieldStyle(.plain)
                .font(PAOS.TypeScale.body)
                .padding(PAOS.Space.md)
                .background(
                    RoundedRectangle(cornerRadius: PAOS.Radius.md, style: .continuous)
                        .fill(PAOS.ColorToken.surfaceMuted)
                )
        }
    }
}
