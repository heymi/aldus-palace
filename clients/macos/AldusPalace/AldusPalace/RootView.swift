import SwiftUI

/// Aldus Experience shell — a quiet status bar, clear primary destinations,
/// and a spacious canvas that keeps one decision visible.
struct RootView: View {
    @EnvironmentObject private var state: AppState
    @AppStorage("aldus.appearance") private var appearance = "light"
    @State private var showDesignSystem = false

    private let primary: [NavTab] = [.today, .memory]
    private let workspace: [NavTab] = [.work, .projects, .thoughts]

    var body: some View {
        VStack(spacing: 0) {
            topBar

            HStack(spacing: 0) {
                sidebar

                ZStack(alignment: .topTrailing) {
                    currentPage
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .id(state.selectedTab)

                    if let err = state.errorMessage {
                        AldusToast(message: err, tone: .error) {
                            state.errorMessage = nil
                        }
                        .padding(28)
                        .transition(.opacity)
                        .zIndex(2)
                    }
                }
                .background(PAOS.ColorToken.canvas)
            }
        }
        .background(PAOS.ColorToken.canvas)
        .ignoresSafeArea(.container, edges: .top)
        .preferredColorScheme(preferredColorScheme)
        .tint(PAOS.ColorToken.primaryText)
        .task { await state.bootstrap() }
        .onReceive(NotificationCenter.default.publisher(for: .showAldusDesignSystem)) { _ in
            showDesignSystem = true
        }
        .sheet(isPresented: $showDesignSystem) {
            AldusComponentGallery()
                .frame(minWidth: 760, minHeight: 720)
        }
        .onAppear {
            if state.isVisualPreview {
                state.selectedTab = .today
                state.errorMessage = nil
            }
        }
    }

    private var topBar: some View {
        HStack(spacing: 10) {
            Text("Aldus")
                .font(PAOS.TypeScale.brand)
                .tracking(-0.35)

            Circle()
                .fill(PAOS.ColorToken.ink)
                .frame(width: 7, height: 7)
                .accessibilityHidden(true)

            Spacer()

            HStack(spacing: 10) {
                ZStack {
                    Circle()
                        .fill(PAOS.ColorToken.ink.opacity(0.08))
                        .frame(width: 18, height: 18)
                    Circle()
                        .fill(state.isOffline ? PAOS.ColorToken.warning : PAOS.ColorToken.ink.opacity(0.78))
                        .frame(width: 7, height: 7)
                }
                Text(state.isOffline ? "Context is reconnecting" : "Context is current")
                    .font(PAOS.TypeScale.subheadline)
                    .foregroundStyle(PAOS.ColorToken.secondaryText)
            }
            .accessibilityElement(children: .combine)
        }
        .padding(.leading, 78)
        .padding(.trailing, 28)
        .frame(height: PAOS.Space.topBar)
        .background(PAOS.ColorToken.topBar)
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(spacing: 10) {
                ForEach(primary) { tab in
                    sidebarRow(tab)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 28)

            Text("Workspace")
                .font(PAOS.TypeScale.caption2)
                .tracking(1.4)
                .textCase(.uppercase)
                .foregroundStyle(PAOS.ColorToken.tertiaryText)
                .padding(.horizontal, 32)
                .padding(.top, 28)
                .padding(.bottom, 8)

            VStack(spacing: 6) {
                ForEach(workspace) { tab in
                    sidebarRow(tab, compact: true)
                }
            }
            .padding(.horizontal, 16)

            Spacer(minLength: 20)

            Text("Aldus keeps one focus visible\nand the system behind it\nexplainable.")
                .font(PAOS.TypeScale.caption)
                .foregroundStyle(PAOS.ColorToken.secondaryText)
                .lineSpacing(5)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 22)
                .padding(.bottom, 24)
        }
        .frame(width: PAOS.Space.sidebarIdeal)
        .background(PAOS.ColorToken.sidebar)
    }

    private func sidebarRow(_ tab: NavTab, compact: Bool = false) -> some View {
        Button {
            state.selectedTab = tab
        } label: {
            HStack {
                Text(navigationTitle(tab))
                    .font(PAOS.TypeScale.sidebar)
                Spacer()
                if tab == .memory {
                    let count = state.memories.filter { $0.status == "candidate" }.count
                    if count > 0 {
                        Text("\(count)")
                            .font(PAOS.TypeScale.caption2.monospacedDigit())
                            .foregroundStyle(PAOS.ColorToken.secondaryText)
                    }
                }
            }
            .foregroundStyle(
                state.selectedTab == tab
                    ? PAOS.ColorToken.primaryText
                    : PAOS.ColorToken.secondaryText
            )
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, minHeight: compact ? 44 : 52, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: PAOS.Radius.md, style: .continuous)
                    .fill(state.selectedTab == tab ? PAOS.ColorToken.surface : .clear)
                    .shadow(
                        color: state.selectedTab == tab ? .black.opacity(0.07) : .clear,
                        radius: 16,
                        x: 0,
                        y: 8
                    )
            )
            .contentShape(RoundedRectangle(cornerRadius: PAOS.Radius.md, style: .continuous))
        }
        .buttonStyle(.quiet)
        .accessibilityLabel(navigationTitle(tab))
        .accessibilityValue(state.selectedTab == tab ? "Selected" : "")
    }

    @ViewBuilder
    private var currentPage: some View {
        switch state.selectedTab {
        case .today: TodayView()
        case .work: WorkView()
        case .thoughts: ThoughtsView()
        case .projects: ProjectsView()
        case .memory: MemoryView()
        case .activity: ActivityView()
        case .capture: CaptureView()
        }
    }

    private func navigationTitle(_ tab: NavTab) -> String {
        switch tab {
        case .today: return "Today"
        case .capture: return "Capture"
        case .memory: return "Memory"
        case .work: return "All work"
        case .projects: return "Projects"
        case .thoughts: return "Thoughts"
        case .activity: return "Activity"
        }
    }

    private var preferredColorScheme: ColorScheme? {
        switch appearance {
        case "dark": return .dark
        case "system": return nil
        default: return .light
        }
    }
}
