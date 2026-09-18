import SwiftUI

extension String {
    /// Display-only spacing for Chinese mixed with Latin text or numbers.
    /// Stored user content remains unchanged.
    var aldusTypeset: String {
        replacingOccurrences(
            of: #"(?<=[\p{Han}])(?=[A-Za-z0-9])|(?<=[A-Za-z0-9])(?=[\p{Han}])"#,
            with: " ",
            options: .regularExpression
        )
    }
}

extension Notification.Name {
    static let showAldusDesignSystem = Notification.Name("showAldusDesignSystem")
    static let focusAldusComposer = Notification.Name("focusAldusComposer")
}

// MARK: - Aldus page chrome

/// Plain-looking button with quiet hover / press feedback.
/// Use instead of `.plain` / `.borderless` on row-level actions so clicks
/// always get a visible response without adding chrome.
struct QuietButtonStyle: ButtonStyle {
    var pressedOpacity: Double = 1
    var hoverOpacity: Double = 1
    var cornerRadius: CGFloat = PAOS.Radius.sm

    func makeBody(configuration: Configuration) -> some View {
        QuietButtonBody(
            configuration: configuration,
            pressedOpacity: pressedOpacity,
            hoverOpacity: hoverOpacity,
            cornerRadius: cornerRadius
        )
    }

    private struct QuietButtonBody: View {
        let configuration: Configuration
        let pressedOpacity: Double
        let hoverOpacity: Double
        let cornerRadius: CGFloat
        @State private var hovering = false
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        var body: some View {
            configuration.label
                .background(
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(
                            configuration.isPressed
                                ? PAOS.ColorToken.surfaceStrong.opacity(pressedOpacity)
                                : (hovering ? PAOS.ColorToken.surfaceMuted.opacity(hoverOpacity) : .clear)
                        )
                )
                .onHover { hovering = $0 }
                .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: hovering)
        }
    }
}

extension ButtonStyle where Self == QuietButtonStyle {
    static var quiet: QuietButtonStyle { QuietButtonStyle() }
}


struct PageHeader<Trailing: View>: View {
    let title: String
    var chips: [String] = []
    @ViewBuilder var trailing: () -> Trailing

    init(
        title: String,
        chips: [String] = [],
        @ViewBuilder trailing: @escaping () -> Trailing = { EmptyView() }
    ) {
        self.title = title
        self.chips = chips
        self.trailing = trailing
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(title.aldusTypeset)
                .font(PAOS.TypeScale.pageTitle)
            ForEach(chips.prefix(2), id: \.self) { chip in
                Text(chip)
                    .font(PAOS.TypeScale.caption)
                    .foregroundStyle(PAOS.ColorToken.secondaryText)
            }
            Spacer(minLength: 8)
            trailing()
        }
    }
}

struct PageHint: View {
    let text: String
    var body: some View {
        Text(text)
            .font(PAOS.TypeScale.subheadline)
            .foregroundStyle(PAOS.ColorToken.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct AldusPageTitle<Trailing: View>: View {
    let title: String
    var subtitle: String?
    @ViewBuilder var trailing: () -> Trailing

    init(
        _ title: String,
        subtitle: String? = nil,
        @ViewBuilder trailing: @escaping () -> Trailing = { EmptyView() }
    ) {
        self.title = title
        self.subtitle = subtitle
        self.trailing = trailing
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: PAOS.Space.md) {
                Text(title)
                    .font(PAOS.TypeScale.largeTitle)
                    .tracking(-1.6)
                Spacer(minLength: PAOS.Space.lg)
                trailing()
            }
            if let subtitle, !subtitle.isEmpty {
                Text(subtitle.aldusTypeset)
                    .font(PAOS.TypeScale.subheadline)
                    .foregroundStyle(PAOS.ColorToken.secondaryText)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct AldusEmptyCard: View {
    let title: String
    let description: String
    var systemImage: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        AldusCard {
            VStack(alignment: .leading, spacing: PAOS.Space.md) {
                Image(systemName: systemImage)
                    .font(PAOS.TypeScale.detailTitle)
                    .foregroundStyle(PAOS.ColorToken.secondaryText)
                    .accessibilityHidden(true)
                Text(title.aldusTypeset)
                    .font(PAOS.TypeScale.detailTitle)
                    .lineSpacing(6)
                Text(description.aldusTypeset)
                    .font(PAOS.TypeScale.subheadline)
                    .foregroundStyle(PAOS.ColorToken.secondaryText)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
                if let actionTitle, let action {
                    Button(actionTitle, action: action)
                        .buttonStyle(PAOSPrimaryButtonStyle())
                        .padding(.top, PAOS.Space.xs)
                }
            }
        }
    }
}

struct QuietSurface<Content: View>: View {
    var padding: CGFloat = PAOS.Space.lg
    var cornerRadius: CGFloat = PAOS.Radius.md
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(PAOS.ColorToken.surface)
            )
            .aldusCardShadow(radius: 10, y: 3)
    }
}

struct KindChip: View {
    let text: String
    var color: Color = .secondary

    var body: some View {
        Text(text)
            .font(PAOS.TypeScale.caption2)
            .foregroundStyle(PAOS.ColorToken.secondaryText)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Capsule().fill(PAOS.ColorToken.surfaceMuted))
    }
}

struct FilterChip: View {
    let title: String
    var count: Int? = nil
    let selected: Bool
    let action: () -> Void
    var accent: Color = PAOS.ColorToken.primaryText

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Text(title)
                if let count, count > 0 {
                    Text("\(count)")
                        .monospacedDigit()
                }
            }
            .font(PAOS.TypeScale.caption)
            .foregroundStyle(selected ? PAOS.ColorToken.inverseInk : PAOS.ColorToken.secondaryText)
            .padding(.horizontal, 10)
            .frame(minHeight: 30)
            .background(
                Capsule().fill(selected ? PAOS.ColorToken.ink : PAOS.ColorToken.surfaceMuted)
            )
        }
        .buttonStyle(.quiet)
    }
}

struct HumanEmptyState: View {
    let title: String
    let systemImage: String
    let description: String
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 16) {
            ContentUnavailableView(title, systemImage: systemImage, description: Text(description))
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(PAOSPrimaryButtonStyle())
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(24)
    }
}

struct MasterRow: View {
    let title: String
    var subtitle: String? = nil
    var leadingChips: [KindChipSpec] = []
    var trailingMeta: String? = nil
    var selected: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            if !leadingChips.isEmpty {
                HStack(spacing: 5) {
                    ForEach(leadingChips.prefix(2)) { chip in
                        KindChip(text: chip.text, color: chip.color)
                    }
                    Spacer(minLength: 0)
                    if let trailingMeta {
                        Text(trailingMeta)
                            .font(PAOS.TypeScale.caption2)
                            .foregroundStyle(PAOS.ColorToken.tertiaryText)
                    }
                }
            }
            Text(title)
                .font(PAOS.TypeScale.body)
                .lineLimit(2)
            if let subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(PAOS.TypeScale.caption)
                    .foregroundStyle(PAOS.ColorToken.secondaryText)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
}

struct KindChipSpec: Identifiable {
    let id = UUID()
    let text: String
    let color: Color
}

struct EditSheetChrome<Content: View>: View {
    let title: String
    var saveTitle: String = "存储"
    var canSave: Bool = true
    var isBusy: Bool = false
    let onCancel: () -> Void
    let onSave: () -> Void
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("取消", action: onCancel)
                    .keyboardShortcut(.cancelAction)
                    .buttonStyle(PAOSGhostButtonStyle())
                Spacer()
                Text(title)
                    .font(PAOS.TypeScale.detailTitle)
                Spacer()
                Button {
                    onSave()
                } label: {
                    HStack(spacing: 6) {
                        if isBusy {
                            ProgressView()
                                .controlSize(.small)
                        }
                        Text(saveTitle)
                    }
                }
                    .keyboardShortcut(.defaultAction)
                    .disabled(!canSave || isBusy)
                    .buttonStyle(PAOSPrimaryButtonStyle())
            }
            .padding(.horizontal, PAOS.Space.xl)
            .padding(.vertical, PAOS.Space.lg)
            .background(PAOS.ColorToken.surfaceRaised)
            content()
                .padding(PAOS.Space.xl)
            Spacer(minLength: 0)
        }
        .frame(minWidth: 400, idealWidth: 440, minHeight: 220)
        .background(PAOS.ColorToken.canvas)
    }
}

struct FormFieldLabel: View {
    let text: String
    var body: some View {
        Text(text)
            .font(PAOS.TypeScale.caption)
            .foregroundStyle(PAOS.ColorToken.secondaryText)
    }
}

struct DetailPaneContainer<Content: View>: View {
    @ViewBuilder var content: () -> Content
    var body: some View {
        ScrollView {
            content()
                .padding(PAOS.Space.xxl)
                .frame(maxWidth: 520, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(PAOS.ColorToken.canvas)
    }
}

struct SoftBanner: View {
    let text: String
    var tone: Tone = .accent
    enum Tone { case accent, success, warning, danger }

    private var symbol: String {
        switch tone {
        case .accent: return "sparkles"
        case .success: return "checkmark.circle"
        case .warning: return "exclamationmark.circle"
        case .danger: return "xmark.circle"
        }
    }

    private var symbolColor: Color {
        switch tone {
        case .accent: return PAOS.ColorToken.primaryText
        case .success: return PAOS.ColorToken.success
        case .warning: return PAOS.ColorToken.warning
        case .danger: return PAOS.ColorToken.danger
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 9) {
            Image(systemName: symbol)
                .foregroundStyle(symbolColor)
                .accessibilityHidden(true)
            Text(text)
                .font(PAOS.TypeScale.subheadline)
                .foregroundStyle(PAOS.ColorToken.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: PAOS.Radius.md, style: .continuous)
                    .fill(PAOS.ColorToken.surfaceRaised)
            )
            .aldusCardShadow(radius: 8, y: 2)
    }
}

struct AldusCard<Content: View>: View {
    var padding: CGFloat = PAOS.Space.xxl
    var elevated = true
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: PAOS.Radius.lg, style: .continuous)
                    .fill(PAOS.ColorToken.surface)
            )
            .modifier(OptionalAldusShadow(enabled: elevated))
    }
}

private struct OptionalAldusShadow: ViewModifier {
    let enabled: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if enabled {
            content.aldusCardShadow()
        } else {
            content
        }
    }
}

struct AldusToast: View {
    enum Tone { case message, error }

    let message: String
    var tone: Tone = .message
    var dismiss: (() -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: tone == .error ? "exclamationmark.circle" : "checkmark.circle")
                .foregroundStyle(tone == .error ? PAOS.ColorToken.danger : PAOS.ColorToken.primaryText)
                .accessibilityHidden(true)
            Text(message)
                .font(PAOS.TypeScale.subheadline)
                .foregroundStyle(PAOS.ColorToken.primaryText)
                .fixedSize(horizontal: false, vertical: true)
            if let dismiss {
                Button("关闭", action: dismiss)
                    .buttonStyle(PAOSGhostButtonStyle())
                    .keyboardShortcut(.cancelAction)
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, dismiss == nil ? 14 : 6)
        .padding(.vertical, 8)
        .frame(maxWidth: 420, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: PAOS.Radius.md, style: .continuous)
                .fill(PAOS.ColorToken.surfaceRaised)
        )
        .aldusCardShadow(radius: 18, y: 6)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Component gallery

struct AldusComponentGallery: View {
    @State private var sampleText = "下周把官网首页的定位再收紧一点"
    @State private var selectedFilter = "全部"

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PAOS.Space.xxxl) {
                VStack(alignment: .leading, spacing: PAOS.Space.sm) {
                    Text("Aldus")
                        .font(PAOS.TypeScale.largeTitle)
                    Text("macOS Visual System")
                        .font(PAOS.TypeScale.subheadline)
                        .foregroundStyle(PAOS.ColorToken.secondaryText)
                }

                gallerySection("Typography") {
                    VStack(alignment: .leading, spacing: PAOS.Space.md) {
                        Text("页面标题 Page title").font(PAOS.TypeScale.pageTitle)
                        Text("卡片标题 Detail title").font(PAOS.TypeScale.detailTitle)
                        Text("正文用于解释发生了什么，以及下一步可以做什么。")
                            .font(PAOS.TypeScale.body)
                        Text("辅助说明与元数据")
                            .font(PAOS.TypeScale.caption)
                            .foregroundStyle(PAOS.ColorToken.secondaryText)
                    }
                }

                gallerySection("Controls") {
                    VStack(alignment: .leading, spacing: PAOS.Space.lg) {
                        HStack(spacing: PAOS.Space.sm) {
                            Button("主要操作") {}
                                .buttonStyle(PAOSPrimaryButtonStyle())
                            Button("次要操作") {}
                                .buttonStyle(PAOSSecondaryButtonStyle())
                            Button("文字操作") {}
                                .buttonStyle(PAOSGhostButtonStyle())
                        }
                        HStack(spacing: PAOS.Space.sm) {
                            ForEach(["全部", "想法", "记忆"], id: \.self) { filter in
                                FilterChip(
                                    title: filter,
                                    selected: selectedFilter == filter
                                ) {
                                    selectedFilter = filter
                                }
                            }
                        }
                        TextField("输入内容", text: $sampleText)
                            .textFieldStyle(.plain)
                            .font(PAOS.TypeScale.body)
                            .padding(PAOS.Space.md)
                            .background(
                                RoundedRectangle(cornerRadius: PAOS.Radius.md, style: .continuous)
                                    .fill(PAOS.ColorToken.surfaceMuted)
                            )
                    }
                }

                gallerySection("Surfaces") {
                    VStack(spacing: PAOS.Space.lg) {
                        AldusCard {
                            VStack(alignment: .leading, spacing: PAOS.Space.sm) {
                                Text("默认卡片").font(PAOS.TypeScale.detailTitle)
                                Text("不使用描边，通过纯净色差和轻投影建立层级。")
                                    .font(PAOS.TypeScale.subheadline)
                                    .foregroundStyle(PAOS.ColorToken.secondaryText)
                            }
                        }
                        SoftBanner(text: "Aldus 已整理输入，并保留了原始内容。", tone: .success)
                        AldusToast(message: "无法连接服务，请稍后重试。", tone: .error)
                    }
                }
            }
            .padding(PAOS.Space.xxxl)
            .frame(maxWidth: 720, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(PAOS.ColorToken.canvas)
        .tint(PAOS.ColorToken.primaryText)
    }

    private func gallerySection<Content: View>(
        _ title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: PAOS.Space.lg) {
            Text(title)
                .font(PAOS.TypeScale.section)
                .foregroundStyle(PAOS.ColorToken.secondaryText)
            content()
        }
    }
}

#if DEBUG
struct AldusComponentGallery_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            AldusComponentGallery()
                .preferredColorScheme(.light)
                .previewDisplayName("Aldus Light")
            AldusComponentGallery()
                .preferredColorScheme(.dark)
                .previewDisplayName("Aldus Dark")
        }
        .frame(width: 760, height: 820)
    }
}
#endif

// MARK: - Dates

enum HumanDate {
    static func format(_ iso: String?) -> String {
        guard let iso, !iso.isEmpty else { return "" }
        guard let date = parse(iso) else {
            return String(iso.prefix(16)).replacingOccurrences(of: "T", with: " ")
        }
        let cal = Calendar.current
        let now = Date()
        if abs(now.timeIntervalSince(date)) < 60 { return L10n.Activity.justNow }
        if cal.isDateInToday(date) { return "\(L10n.Activity.today) \(timeOnly.string(from: date))" }
        if cal.isDateInYesterday(date) { return "\(L10n.Activity.yesterday) \(timeOnly.string(from: date))" }
        if cal.isDate(date, equalTo: now, toGranularity: .year) { return monthDay.string(from: date) }
        return fullDay.string(from: date)
    }

    static func daySection(_ iso: String?) -> String {
        guard let iso, let date = parse(iso) else { return L10n.Activity.earlier }
        let cal = Calendar.current
        if cal.isDateInToday(date) { return L10n.Activity.today }
        if cal.isDateInYesterday(date) { return L10n.Activity.yesterday }
        if cal.isDate(date, equalTo: Date(), toGranularity: .year) {
            return monthDayOnly.string(from: date)
        }
        return fullDay.string(from: date)
    }

    private static func parse(_ iso: String) -> Date? {
        let f1 = ISO8601DateFormatter()
        f1.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f1.date(from: iso) { return d }
        let f2 = ISO8601DateFormatter()
        f2.formatOptions = [.withInternetDateTime]
        if let d = f2.date(from: iso) { return d }
        let local = DateFormatter()
        local.locale = Locale(identifier: "en_US_POSIX")
        local.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        return local.date(from: String(iso.prefix(19)))
    }

    private static let timeOnly: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "zh_CN"); f.dateFormat = "HH:mm"; return f
    }()
    private static let monthDay: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "zh_CN"); f.dateFormat = "M月d日 HH:mm"; return f
    }()
    private static let monthDayOnly: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "zh_CN"); f.dateFormat = "M月d日"; return f
    }()
    private static let fullDay: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "zh_CN"); f.dateFormat = "yyyy年M月d日"; return f
    }()
}

enum ActivityCopy {
    static func systemImage(_ type: String, actor: String) -> String {
        switch type {
        case "input_captured", "input_created", "capture": return "square.and.pencil"
        case "processing_input", "objects_extracted": return "sparkles"
        case "thought_created", "thought_updated", "thought_deleted": return "lightbulb"
        case "commitment_created", "commitment_updated", "commitment_deleted",
             "commitments_deduped", "commitment_titles_rewritten": return "checkmark.circle"
        case "user_started", "start_commitment": return "play.circle"
        case "user_completed", "complete_commitment": return "checkmark.circle.fill"
        case "commitment_cancelled": return "xmark.circle"
        case "thought_converted": return "arrow.right.circle"
        case "memory_candidate_created", "memory_confirmed", "memory_rejected",
             "memory_updated", "memory_deleted", "memory_context_injected": return "brain"
        case "project_created", "project_updated", "project_deleted", "project_relinked": return "folder"
        case "clarification_resolved", "clarification_requested": return "calendar"
        default: return L10n.Activity.isAI(actor) ? "sparkles" : "person"
        }
    }
}
