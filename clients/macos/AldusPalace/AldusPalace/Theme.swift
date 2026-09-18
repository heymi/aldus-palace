import SwiftUI
import AppKit

// MARK: - Aldus design tokens
// Monochrome, native and quiet. Hierarchy comes from tone, space and type;
// borders are reserved for focus and structural separation.

enum PAOS {
    enum Space {
        static let xxs: CGFloat = 2
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 18
        static let xl: CGFloat = 24
        static let xxl: CGFloat = 36
        static let xxxl: CGFloat = 56
        static let page: CGFloat = 72
        static let contentMax: CGFloat = 1180
        static let railIdeal: CGFloat = 292
        static let railMin: CGFloat = 260
        static let railMax: CGFloat = 340
        static let sidebarIdeal: CGFloat = 184
        static let topBar: CGFloat = 64
    }

    enum Radius {
        static let xs: CGFloat = 6
        static let sm: CGFloat = 9
        static let md: CGFloat = 14
        static let lg: CGFloat = 22
        static let xl: CGFloat = 28
    }

    /// The Experience reference uses optical scale, not heavy weight, for hierarchy.
    enum TypeScale {
        static let experienceHero = Font.system(size: 62, weight: .regular, design: .default)
        static let largeTitle = Font.system(size: 48, weight: .regular, design: .default)
        static let pageTitle = Font.system(size: 38, weight: .regular, design: .default)
        static let detailTitle = Font.system(size: 27, weight: .regular, design: .default)

        static let section = Font.system(size: 12, weight: .regular, design: .default)
        static let headline = Font.system(size: 16, weight: .regular, design: .default)
        static let body = Font.system(size: 16, weight: .regular, design: .default)
        static let bodyLarge = Font.system(size: 18, weight: .regular, design: .default)
        static let cardTitle = Font.system(size: 17, weight: .regular, design: .default)
        static let readingBody = Font.system(size: 16, weight: .regular, design: .default)
        static let bodyEmphasized = body
        static let rowTitle = body
        static let rowMeta = Font.system(size: 12, weight: .regular, design: .default)
        static let control = Font.system(size: 15, weight: .regular, design: .default)
        static let callout = Font.system(size: 15, weight: .regular, design: .default)
        static let subheadline = Font.system(size: 14, weight: .regular, design: .default)
        static let footnote = Font.system(size: 13, weight: .regular, design: .default)
        static let caption = Font.system(size: 13, weight: .regular, design: .default)
        static let caption2 = Font.system(size: 11, weight: .regular, design: .default)
        static let micro = caption2
        static let sidebar = Font.system(size: 15, weight: .regular, design: .default)
        static let sidebarSection = Font.system(size: 11, weight: .regular, design: .default)
        static let brand = Font.system(size: 23, weight: .regular, design: .serif)
    }

    enum ColorToken {
        static let canvas = dynamic(light: 0xF1F1F1, dark: 0x111111)
        static let topBar = dynamic(light: 0xEEEEEE, dark: 0x101010)
        static let sidebar = dynamic(light: 0xF7F7F7, dark: 0x151515)
        static let surface = dynamic(light: 0xFFFFFF, dark: 0x1C1C1C)
        static let surfaceRaised = dynamic(light: 0xFAFAFA, dark: 0x222222)
        static let surfaceMuted = dynamic(light: 0xEFEFEF, dark: 0x2B2B2B)
        static let surfaceStrong = dynamic(light: 0xE7E7E7, dark: 0x353535)

        static let ink = dynamic(light: 0x050505, dark: 0xF7F7F7)
        static let inverseInk = dynamic(light: 0xFFFFFF, dark: 0x090909)
        static let secondaryText = dynamic(light: 0x606060, dark: 0xB8B8B8)
        static let tertiaryText = dynamic(light: 0x7A7A7A, dark: 0x929292)
        static let disabledText = dynamic(light: 0x9A9A9A, dark: 0x696969)
        static let separator = dynamic(light: 0xE5E5E5, dark: 0x353535)
        static let focusRing = dynamic(light: 0x171717, dark: 0xF4F4F4)

        // Compatibility aliases. The Aldus accent is intentionally achromatic.
        static let accent = ink
        static let accentSoft = surfaceMuted
        static let accentRing = focusRing.opacity(0.24)
        static let textBackground = surface
        static let fill = surfaceMuted
        static let fillStrong = surfaceStrong
        static let hairline = separator
        static let primaryText = ink

        // Semantic colors are reserved for small status glyphs and error copy.
        static let success = dynamic(light: 0x2D5B3B, dark: 0x8DC69E)
        static let warning = dynamic(light: 0x715019, dark: 0xD4B06B)
        static let danger = dynamic(light: 0xA33232, dark: 0xE58B8B)
        static let orange = warning
        static let purple = secondaryText

        private static func dynamic(light: Int, dark: Int) -> Color {
            Color(nsColor: NSColor(name: nil) { appearance in
                let match = appearance.bestMatch(from: [.darkAqua, .aqua])
                return nsColor(hex: match == .darkAqua ? dark : light)
            })
        }

        private static func nsColor(hex: Int) -> NSColor {
            NSColor(
                calibratedRed: CGFloat((hex >> 16) & 0xff) / 255,
                green: CGFloat((hex >> 8) & 0xff) / 255,
                blue: CGFloat(hex & 0xff) / 255,
                alpha: 1
            )
        }
    }
}

extension View {
    func paosCanvas() -> some View {
        background(PAOS.ColorToken.canvas)
    }

    func aldusCardShadow(radius: CGFloat = 14, y: CGFloat = 4) -> some View {
        modifier(AldusCardShadow(radius: radius, y: y))
    }
}

private struct AldusCardShadow: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    let radius: CGFloat
    let y: CGFloat

    func body(content: Content) -> some View {
        content.shadow(
            color: colorScheme == .dark ? .black.opacity(0.30) : .black.opacity(0.075),
            radius: radius,
            x: 0,
            y: y
        )
    }
}

// MARK: - Aldus buttons

private enum AldusButtonKind {
    case primary
    case secondary
    case ghost
}

private struct AldusButtonBody<Label: View>: View {
    let label: Label
    let isPressed: Bool
    let kind: AldusButtonKind

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isHovering = false

    private var foreground: Color {
        kind == .primary ? PAOS.ColorToken.inverseInk : PAOS.ColorToken.primaryText
    }

    private var background: Color {
        switch kind {
        case .primary:
            return PAOS.ColorToken.ink.opacity(isPressed ? 0.82 : 1)
        case .secondary:
            return isPressed
                ? PAOS.ColorToken.surfaceStrong
                : (isHovering ? PAOS.ColorToken.surfaceMuted : PAOS.ColorToken.surfaceRaised)
        case .ghost:
            return (isPressed || isHovering) ? PAOS.ColorToken.surfaceMuted : .clear
        }
    }

    var body: some View {
        label
            .font(PAOS.TypeScale.control)
            .foregroundStyle(foreground)
            .padding(.horizontal, kind == .ghost ? 10 : 14)
            .frame(minHeight: 36)
            .background(
                RoundedRectangle(cornerRadius: PAOS.Radius.sm, style: .continuous)
                    .fill(background)
            )
            .contentShape(RoundedRectangle(cornerRadius: PAOS.Radius.sm, style: .continuous))
            .scaleEffect(isPressed && !reduceMotion ? 0.96 : 1)
            .opacity(isEnabled ? 1 : 0.42)
            .onHover { isHovering = $0 }
            .animation(
                reduceMotion ? nil : .easeOut(duration: 0.12),
                value: isPressed
            )
            .animation(
                reduceMotion ? nil : .easeOut(duration: 0.12),
                value: isHovering
            )
    }
}

struct PAOSPrimaryButtonStyle: ButtonStyle {
    var prominent: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        AldusButtonBody(label: configuration.label, isPressed: configuration.isPressed, kind: .primary)
    }
}

struct PAOSSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        AldusButtonBody(label: configuration.label, isPressed: configuration.isPressed, kind: .secondary)
    }
}

struct PAOSGhostButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        AldusButtonBody(label: configuration.label, isPressed: configuration.isPressed, kind: .ghost)
    }
}

private struct AldusInvertedButtonBody<Label: View>: View {
    let label: Label
    let isPressed: Bool
    let primary: Bool

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isHovering = false

    var body: some View {
        label
            .font(PAOS.TypeScale.control)
            .foregroundStyle(primary ? PAOS.ColorToken.primaryText : PAOS.ColorToken.inverseInk)
            .padding(.horizontal, 14)
            .frame(minHeight: 36)
            .background(
                RoundedRectangle(cornerRadius: PAOS.Radius.sm, style: .continuous)
                    .fill(
                        primary
                            ? PAOS.ColorToken.inverseInk.opacity(isPressed ? 0.82 : 1)
                            : PAOS.ColorToken.inverseInk.opacity(isPressed ? 0.20 : (isHovering ? 0.15 : 0.10))
                    )
            )
            .contentShape(RoundedRectangle(cornerRadius: PAOS.Radius.sm, style: .continuous))
            .scaleEffect(isPressed && !reduceMotion ? 0.96 : 1)
            .opacity(isEnabled ? 1 : 0.42)
            .onHover { isHovering = $0 }
            .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: isPressed)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: isHovering)
    }
}

struct PAOSInvertedPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        AldusInvertedButtonBody(
            label: configuration.label,
            isPressed: configuration.isPressed,
            primary: true
        )
    }
}

struct PAOSInvertedSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        AldusInvertedButtonBody(
            label: configuration.label,
            isPressed: configuration.isPressed,
            primary: false
        )
    }
}
