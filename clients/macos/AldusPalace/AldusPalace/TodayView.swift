import SwiftUI

/// Aldus home workspace: current context, suggested next moves, and one
/// persistent natural-language input.
struct TodayView: View {
    @EnvironmentObject private var state: AppState
    @SceneStorage("aldus.composerDraft") private var text = ""
    @FocusState private var composerFocused: Bool

    private var canSubmit: Bool {
        !state.isBusy && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView {
                VStack(alignment: .center, spacing: 0) {
                    hero

                    Group {
                        if state.isBusy && state.today == nil {
                            loadingSuggestions
                        } else if let today = state.today {
                            suggestionGrid(today)
                        } else {
                            fallbackSuggestions
                        }
                    }
                    .padding(.top, 42)

                    if !state.pendingClarifications.isEmpty {
                        PendingClarificationBanner()
                            .padding(.top, 28)
                    }

                    if let card = state.lastActionCard {
                        ActionCardView(card: card)
                            .padding(.top, 28)
                            .transition(.opacity)
                    }
                }
                .padding(.horizontal, 56)
                .padding(.top, 54)
                .padding(.bottom, 232)
                .frame(maxWidth: PAOS.Space.contentMax)
                .frame(maxWidth: .infinity)
            }

            composer
        }
        .background(PAOS.ColorToken.canvas)
        .task {
            await state.refreshToday()
            await state.refreshPendingClarifications()
        }
        .refreshable {
            await state.refreshToday()
            await state.refreshLists()
        }
        .onReceive(NotificationCenter.default.publisher(for: .focusAldusComposer)) { _ in
            composerFocused = true
        }
        .onAppear {
            if state.isVisualPreview {
                text = ""
            }
        }
    }

    private var hero: some View {
        VStack(spacing: 20) {
            Image(systemName: "sparkles")
                .font(.system(size: 28, weight: .regular))
                .foregroundStyle(PAOS.ColorToken.tertiaryText)
                .accessibilityHidden(true)

            VStack(spacing: 12) {
                Text("What should Aldus move forward?")
                    .font(PAOS.TypeScale.largeTitle)
                    .tracking(-2)
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.isHeader)

                Text(Self.eyebrowFormatter.string(from: Date()).uppercased())
                    .font(PAOS.TypeScale.caption.monospaced())
                    .tracking(2)
                    .foregroundStyle(PAOS.ColorToken.secondaryText)
            }
        }
    }

    private func suggestionGrid(_ today: TodayPayload) -> some View {
        let later = today.timeline.filter { $0.id != today.now?.id }

        return LazyVGrid(
            columns: [GridItem(.adaptive(minimum: 190, maximum: 280), spacing: 16)],
            spacing: 16
        ) {
            if let now = today.now {
                AldusSuggestionCard(
                    systemImage: "scope",
                    eyebrow: "Now",
                    title: now.title,
                    detail: durationText(for: now) ?? "Current focus"
                ) {
                    state.showCommitment(now.id)
                }
            } else {
                AldusSuggestionCard(
                    systemImage: "scope",
                    eyebrow: "Now",
                    title: "Choose the next move",
                    detail: "Review open work"
                ) {
                    state.selectedTab = .work
                }
            }

            if let next = later.first {
                AldusSuggestionCard(
                    systemImage: "clock",
                    eyebrow: "Later today",
                    title: next.title,
                    detail: laterDetail(next, count: later.count)
                ) {
                    state.showCommitment(next.id)
                }
            } else {
                AldusSuggestionCard(
                    systemImage: "clock",
                    eyebrow: "Later today",
                    title: "The rest of the day is open",
                    detail: "Plan only if it helps"
                ) {
                    prepare("帮我看看今天剩余时间最值得推进什么")
                }
            }

            AldusSuggestionCard(
                systemImage: "tray.full",
                eyebrow: "All work",
                title: workSummary,
                detail: "Review every open commitment"
            ) {
                state.selectedTab = .work
            }

            AldusSuggestionCard(
                systemImage: "text.bubble",
                eyebrow: "Capture",
                title: "Say what is on your mind",
                detail: "Aldus will structure it"
            ) {
                text = ""
                composerFocused = true
            }
        }
    }

    private var fallbackSuggestions: some View {
        LazyVGrid(
            columns: [GridItem(.adaptive(minimum: 190, maximum: 280), spacing: 16)],
            spacing: 16
        ) {
            AldusSuggestionCard(
                systemImage: "scope",
                eyebrow: "Today",
                title: "Review the next move",
                detail: "Context will reconnect quietly"
            ) {
                Task { await state.refreshToday() }
            }

            AldusSuggestionCard(
                systemImage: "tray.full",
                eyebrow: "All work",
                title: workSummary,
                detail: "Review every open commitment"
            ) {
                state.selectedTab = .work
            }

            AldusSuggestionCard(
                systemImage: "folder",
                eyebrow: "Projects",
                title: "Return to active context",
                detail: "Goals, thoughts, and commitments"
            ) {
                state.selectedTab = .projects
            }

            AldusSuggestionCard(
                systemImage: "text.bubble",
                eyebrow: "Capture",
                title: "Say what is on your mind",
                detail: "Aldus will structure it"
            ) {
                composerFocused = true
            }
        }
    }

    private var loadingSuggestions: some View {
        HStack(spacing: 16) {
            ForEach(0..<4, id: \.self) { _ in
                RoundedRectangle(cornerRadius: PAOS.Radius.lg, style: .continuous)
                    .fill(PAOS.ColorToken.surface)
                    .frame(maxWidth: .infinity, minHeight: 150)
            }
        }
        .redacted(reason: .placeholder)
        .accessibilityLabel("Loading suggestions")
    }

    private var composer: some View {
        VStack(spacing: 0) {
            HStack(spacing: 20) {
                Label("Today", systemImage: "calendar")
                Label("Auto-structure", systemImage: "wand.and.stars")
                Spacer()
                Text("Thought · Commitment · Decision · Memory")
                    .foregroundStyle(PAOS.ColorToken.tertiaryText)
            }
            .font(PAOS.TypeScale.caption)
            .foregroundStyle(PAOS.ColorToken.secondaryText)
            .padding(.horizontal, 28)
            .frame(height: 46)
            .background(PAOS.ColorToken.surfaceMuted)

            VStack(alignment: .leading, spacing: 10) {
                TextEditor(text: $text)
                    .font(PAOS.TypeScale.bodyLarge)
                    .foregroundStyle(PAOS.ColorToken.primaryText)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 56, maxHeight: 96)
                    .focused($composerFocused)
                    .overlay(alignment: .topLeading) {
                        if text.isEmpty {
                            Text(
                                state.pendingClarifications.isEmpty
                                    ? "Tell Aldus anything…"
                                    : "Reply with the intended time…"
                            )
                            .font(PAOS.TypeScale.bodyLarge)
                            .foregroundStyle(PAOS.ColorToken.tertiaryText)
                            .padding(.top, 8)
                            .allowsHitTesting(false)
                            .accessibilityHidden(true)
                        }
                    }
                    .accessibilityLabel("输入内容")
                    .accessibilityHint("输入想法、承诺或决定，按 Command Return 提交")

                HStack {
                    Text("⌘ ↩  Capture")
                        .font(PAOS.TypeScale.caption)
                        .foregroundStyle(PAOS.ColorToken.tertiaryText)

                    Spacer()

                    Button {
                        submit()
                    } label: {
                        Group {
                            if state.isBusy {
                                ProgressView()
                                    .controlSize(.small)
                                    .tint(.white)
                            } else {
                                Image(systemName: "arrow.up")
                            }
                        }
                        .font(PAOS.TypeScale.body)
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(
                            Circle()
                                .fill(canSubmit ? PAOS.ColorToken.ink : PAOS.ColorToken.tertiaryText)
                        )
                    }
                    .buttonStyle(.quiet)
                    .disabled(!canSubmit)
                    .keyboardShortcut(.return, modifiers: [.command])
                    .accessibilityLabel(
                        state.pendingClarifications.isEmpty ? "Capture" : "Confirm"
                    )
                }
            }
            .padding(.horizontal, 28)
            .padding(.top, 16)
            .padding(.bottom, 18)
            .background(PAOS.ColorToken.surface)
        }
        .frame(maxWidth: 980)
        .clipShape(RoundedRectangle(cornerRadius: PAOS.Radius.xl, style: .continuous))
        .aldusCardShadow(radius: 28, y: 12)
        .padding(.horizontal, 40)
        .padding(.bottom, 24)
    }

    private var workSummary: String {
        let count = state.commitments.filter(\.isOpen).count
        return count == 0 ? "See everything in motion" : "\(count) open commitments"
    }

    private func laterDetail(_ item: TodayCommitment, count: Int) -> String {
        let time = timeText(for: item)
        if count > 1 {
            return "\(time) · \(count - 1) more"
        }
        return "\(time) · \(scheduleMeta(for: item))"
    }

    private func prepare(_ prompt: String) {
        text = prompt
        composerFocused = true
    }

    private func submit() {
        let submission = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !submission.isEmpty else { return }

        Task {
            await state.capture(submission, returningTo: .today)
            if state.errorMessage == nil {
                text = ""
            }
        }
    }

    private func scheduleMeta(for item: TodayCommitment) -> String {
        let kind = item.kind_label?.trimmingCharacters(in: .whitespacesAndNewlines)
        let duration = durationText(for: item)
        switch (kind, duration) {
        case let (.some(kind), .some(duration)) where !kind.isEmpty:
            return "\(simpleKind(kind)) · \(duration)"
        case let (.some(kind), _) where !kind.isEmpty:
            return simpleKind(kind)
        case let (_, .some(duration)):
            return duration
        default:
            return "Flexible"
        }
    }

    private func simpleKind(_ kind: String) -> String {
        if kind.contains("AI") || kind.contains("建议") { return "AI suggested" }
        if kind.contains("固定") || kind.contains("Fixed") { return "Fixed" }
        if kind.contains("灵活") || kind.contains("Flexible") { return "Flexible" }
        return kind
    }

    private func timeText(for item: TodayCommitment) -> String {
        guard let date = slotStart(for: item) else { return "Open" }
        return Self.timeFormatter.string(from: date)
    }

    private func durationText(for item: TodayCommitment?) -> String? {
        guard let item,
              let start = slotStart(for: item),
              let end = slotEnd(for: item) else { return nil }
        let minutes = max(1, Int(end.timeIntervalSince(start) / 60))
        return "\(minutes) min"
    }

    private func slotStart(for item: TodayCommitment) -> Date? {
        Self.parseDate(item.ai_slot_start ?? item.window_start)
    }

    private func slotEnd(for item: TodayCommitment) -> Date? {
        Self.parseDate(item.ai_slot_end ?? item.window_end)
    }

    private static func parseDate(_ value: String?) -> Date? {
        guard let value else { return nil }
        return isoFormatter.date(from: value)
    }

    private static let isoFormatter = ISO8601DateFormatter()

    private static let eyebrowFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "EEEE, MMMM d"
        return formatter
    }()

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "HH:mm"
        return formatter
    }()
}

private struct AldusSuggestionCard: View {
    let systemImage: String
    let eyebrow: String
    let title: String
    let detail: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Image(systemName: systemImage)
                        .font(PAOS.TypeScale.body)
                    Spacer()
                    Text(eyebrow.uppercased())
                        .font(PAOS.TypeScale.caption2)
                        .tracking(1.2)
                }
                .foregroundStyle(PAOS.ColorToken.secondaryText)

                Spacer(minLength: 28)

                Text(title.aldusTypeset)
                    .font(PAOS.TypeScale.cardTitle)
                    .foregroundStyle(PAOS.ColorToken.primaryText)
                    .lineSpacing(6)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)

                Text(detail.aldusTypeset)
                    .font(PAOS.TypeScale.caption)
                    .foregroundStyle(PAOS.ColorToken.secondaryText)
                    .lineSpacing(3)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
            }
            .padding(22)
            .frame(maxWidth: .infinity, minHeight: 168, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: PAOS.Radius.lg, style: .continuous)
                    .fill(PAOS.ColorToken.surface)
            )
            .contentShape(RoundedRectangle(cornerRadius: PAOS.Radius.lg, style: .continuous))
        }
        .buttonStyle(.quiet)
        .aldusCardShadow(radius: 16, y: 7)
        .help(title.aldusTypeset)
    }
}

func statusLabel(_ status: String) -> String {
    L10n.Labels.commitmentStatus(status)
}
