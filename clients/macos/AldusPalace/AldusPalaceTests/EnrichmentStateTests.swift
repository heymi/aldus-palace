import Foundation

@main
struct EnrichmentStateTests {
    static func main() {
        let failed = EnrichmentState.resolve(
            processingStatus: "local",
            errorMessage: "DeepSeek rejected the configured model"
        )
        precondition(!failed.isEnriching)
        precondition(failed.terminalError == "DeepSeek rejected the configured model")

        let pending = EnrichmentState.resolve(
            processingStatus: "local",
            errorMessage: nil
        )
        precondition(pending.isEnriching)
        precondition(pending.terminalError == nil)

        print("enrichment state tests passed")
    }
}
