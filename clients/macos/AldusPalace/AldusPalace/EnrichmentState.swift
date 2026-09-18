import Foundation

struct EnrichmentState {
    struct Resolution {
        let isEnriching: Bool
        let terminalError: String?
    }

    static func resolve(
        processingStatus: String,
        errorMessage: String?
    ) -> Resolution {
        let error = errorMessage?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let error, !error.isEmpty {
            return Resolution(isEnriching: false, terminalError: error)
        }
        return Resolution(
            isEnriching: processingStatus == "local" || processingStatus == "enriching",
            terminalError: nil
        )
    }
}
