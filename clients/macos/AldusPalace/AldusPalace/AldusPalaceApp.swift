import SwiftUI

@main
struct AldusPalaceApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
                .frame(minWidth: 900, minHeight: 560)
        }
        .defaultSize(width: 1280, height: 820)
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandMenu("前往") {
                Button("今日") { appState.selectedTab = .today }
                    .keyboardShortcut("1", modifiers: .command)
                Button("输入") {
                    appState.selectedTab = .today
                    DispatchQueue.main.async {
                        NotificationCenter.default.post(name: .focusAldusComposer, object: nil)
                    }
                }
                    .keyboardShortcut("2", modifiers: .command)
                Button("要做的事") { appState.selectedTab = .work }
                    .keyboardShortcut("3", modifiers: .command)
                Divider()
                Button("记忆") { appState.selectedTab = .memory }
                    .keyboardShortcut("4", modifiers: .command)
                Button("项目") { appState.selectedTab = .projects }
                    .keyboardShortcut("5", modifiers: .command)
                Button("想法") { appState.selectedTab = .thoughts }
                    .keyboardShortcut("6", modifiers: .command)
                Button("动态") { appState.selectedTab = .activity }
            }
#if DEBUG
            CommandMenu("Aldus") {
                Button("组件库") {
                    NotificationCenter.default.post(name: .showAldusDesignSystem, object: nil)
                }
                .keyboardShortcut("d", modifiers: [.command, .option])
            }
#endif
        }
    }
}
