import SwiftUI

/// Aldus Capture: one calm input, then a structured receipt.
struct CaptureView: View {
    @EnvironmentObject private var state: AppState
    @State private var text = ""
    @FocusState private var focused: Bool

    private var pending: [Clarification] {
        state.pendingClarifications
    }

    private var canSubmit: Bool {
        !state.isBusy && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PAOS.Space.xxxl) {
                VStack(alignment: .leading, spacing: 18) {
                    Text("CAPTURE")
                        .font(PAOS.TypeScale.section.monospaced())
                        .tracking(2.2)
                        .foregroundStyle(PAOS.ColorToken.secondaryText)
                    Text("Say it once. Aldus\nholds the structure.")
                        .font(PAOS.TypeScale.experienceHero)
                        .tracking(-3.4)
                        .lineSpacing(-4)
                        .fixedSize(horizontal: false, vertical: true)
                        .minimumScaleFactor(0.78)
                    Text("Thought, commitment, decision, or memory — no sorting required.")
                        .font(PAOS.TypeScale.body)
                        .foregroundStyle(PAOS.ColorToken.secondaryText)
                }

                if !pending.isEmpty {
                    PendingClarificationBanner()
                }

                captureSurface

                if let card = state.lastActionCard {
                    ActionCardView(card: card)
                        .transition(.opacity)
                }
            }
            .padding(.horizontal, PAOS.Space.page)
            .padding(.top, 70)
            .padding(.bottom, PAOS.Space.xxxl)
            .frame(maxWidth: PAOS.Space.contentMax, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(PAOS.ColorToken.canvas)
        .onAppear { focused = true }
        .task { await state.refreshPendingClarifications() }
    }

    private var captureSurface: some View {
        VStack(alignment: .leading, spacing: PAOS.Space.md) {
            TextEditor(text: $text)
                .font(PAOS.TypeScale.bodyLarge)
                .foregroundStyle(PAOS.ColorToken.primaryText)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 210, maxHeight: 340)
                .focused($focused)
                .overlay(alignment: .topLeading) {
                    if text.isEmpty {
                        Text(pending.isEmpty ? "What is on your mind?" : "Reply with the intended time")
                            .font(PAOS.TypeScale.bodyLarge)
                            .foregroundStyle(PAOS.ColorToken.tertiaryText)
                            .padding(.top, 8)
                            .allowsHitTesting(false)
                            .accessibilityHidden(true)
                    }
                }
                .accessibilityLabel("输入内容")
                .accessibilityHint("输入想法、承诺或决定，按 Command Return 提交")

            HStack(spacing: PAOS.Space.sm) {
                Text("⌘ ↩  Commit")
                    .font(PAOS.TypeScale.caption)
                    .foregroundStyle(PAOS.ColorToken.tertiaryText)
                Spacer()
                Button {
                    Task {
                        await state.capture(text)
                        text = ""
                    }
                } label: {
                    HStack(spacing: 7) {
                        if state.isBusy {
                            ProgressView()
                                .controlSize(.small)
                        }
                        Text(pending.isEmpty ? "Capture" : "Confirm")
                    }
                    .frame(minWidth: 64)
                }
                .buttonStyle(PAOSPrimaryButtonStyle())
                .disabled(!canSubmit)
                .keyboardShortcut(.return, modifiers: [.command])
            }
        }
        .padding(36)
        .background(
            RoundedRectangle(cornerRadius: PAOS.Radius.xl, style: .continuous)
                .fill(PAOS.ColorToken.surface)
        )
        .overlay {
            if focused {
                RoundedRectangle(cornerRadius: PAOS.Radius.xl, style: .continuous)
                    .stroke(PAOS.ColorToken.focusRing.opacity(0.62), lineWidth: 1)
            }
        }
        .aldusCardShadow(radius: 24, y: 10)
    }
}

struct PendingClarificationBanner: View {
    @EnvironmentObject private var state: AppState

    var body: some View {
        AldusCard {
            VStack(alignment: .leading, spacing: PAOS.Space.lg) {
                HStack(spacing: PAOS.Space.sm) {
                    Image(systemName: "clock")
                        .foregroundStyle(PAOS.ColorToken.warning)
                        .accessibilityHidden(true)
                    Text("确认一下时间")
                        .font(PAOS.TypeScale.detailTitle)
                }

                Text("你提到的时间可能有两种理解。选一个就好。")
                    .font(PAOS.TypeScale.subheadline)
                    .foregroundStyle(PAOS.ColorToken.secondaryText)

                ForEach(state.pendingClarifications) { clarification in
                    VStack(alignment: .leading, spacing: PAOS.Space.md) {
                        Text(clarification.prompt)
                            .font(PAOS.TypeScale.body)
                            .fixedSize(horizontal: false, vertical: true)

                        VStack(spacing: PAOS.Space.sm) {
                            ForEach(clarification.options) { option in
                                Button {
                                    Task {
                                        await state.resolveClarification(
                                            clarification.id,
                                            optionId: option.id
                                        )
                                    }
                                } label: {
                                    Text(option.label)
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(PAOSSecondaryButtonStyle())
                                .disabled(state.isBusy)
                            }
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Structured receipt

struct ActionCardView: View {
    @EnvironmentObject private var state: AppState
    let card: ActionCard

    private var enriching: Bool {
        card.is_enriching == true
            || (card.source_input_id != nil && state.enrichingInputId == card.source_input_id)
    }

    private var hasMemories: Bool { !card.memory_candidates.isEmpty }

    private var headline: String {
        if enriching { return "正在整理…" }
        if !card.summary.isEmpty { return card.summary }
        var parts: [String] = ["已记下"]
        if !card.thoughts.isEmpty { parts.append("\(card.thoughts.count) 条想法") }
        if !card.commitments.isEmpty { parts.append("\(card.commitments.count) 件要做") }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        AldusCard {
            VStack(alignment: .leading, spacing: PAOS.Space.lg) {
                HStack(alignment: .top, spacing: PAOS.Space.sm) {
                    if enriching {
                        ProgressView()
                            .controlSize(.small)
                            .accessibilityLabel("正在整理")
                    } else {
                        Image(systemName: "checkmark.circle")
                            .font(PAOS.TypeScale.detailTitle)
                            .foregroundStyle(PAOS.ColorToken.success)
                            .accessibilityHidden(true)
                    }
                    Text(headline.aldusTypeset)
                        .font(PAOS.TypeScale.detailTitle)
                        .foregroundStyle(PAOS.ColorToken.primaryText)
                        .lineSpacing(6)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }

                if hasMemories {
                    VStack(alignment: .leading, spacing: PAOS.Space.sm) {
                        Text("记忆候选")
                            .font(PAOS.TypeScale.section)
                            .foregroundStyle(PAOS.ColorToken.secondaryText)
                        ForEach(card.memory_candidates.prefix(2)) { memory in
                            Text(memory.content.aldusTypeset)
                                .font(PAOS.TypeScale.subheadline)
                                .foregroundStyle(PAOS.ColorToken.secondaryText)
                                .lineSpacing(4)
                                .lineLimit(3)
                        }
                        if card.memory_candidates.count > 2 {
                            Text("另有 \(card.memory_candidates.count - 2) 条")
                                .font(PAOS.TypeScale.caption)
                                .foregroundStyle(PAOS.ColorToken.tertiaryText)
                        }
                    }
                    .padding(PAOS.Space.md)
                    .background(
                        RoundedRectangle(cornerRadius: PAOS.Radius.md, style: .continuous)
                            .fill(PAOS.ColorToken.surfaceMuted)
                    )
                }

                if !card.thoughts.isEmpty || !card.commitments.isEmpty {
                    VStack(alignment: .leading, spacing: PAOS.Space.sm) {
                        ForEach(card.commitments.prefix(3)) { commitment in
                            Label(commitment.title.aldusTypeset, systemImage: "circle")
                                .font(PAOS.TypeScale.subheadline)
                                .foregroundStyle(PAOS.ColorToken.primaryText)
                        }
                        ForEach(card.thoughts.prefix(2)) { thought in
                            Label(thought.displayTitle.aldusTypeset, systemImage: "lightbulb")
                                .font(PAOS.TypeScale.subheadline)
                                .foregroundStyle(PAOS.ColorToken.secondaryText)
                                .lineSpacing(4)
                                .lineLimit(2)
                        }
                    }
                }

                Button {
                    Task { await state.acceptActionCard(rememberMemories: true) }
                } label: {
                    Text(enriching ? "请稍候" : "好")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(PAOSPrimaryButtonStyle())
                .disabled(state.isBusy || enriching)
                .keyboardShortcut(.defaultAction)
            }
        }
    }
}
