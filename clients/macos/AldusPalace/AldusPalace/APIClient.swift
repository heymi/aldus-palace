import Foundation
import Security

private enum APIConfiguration {
    /// Local development default. Set ALDUS_PALACE_API_URL to point at a deployed server.
    static let localURL = URL(string: "http://127.0.0.1:8787")!
    static let keychainService = "app.alduspalace.AldusPalace.api"
    static let keychainAccount = "api"

    static var baseURL: URL {
        if let value = ProcessInfo.processInfo.environment["ALDUS_PALACE_API_URL"],
           let url = URL(string: value)
        {
            return url
        }
        return localURL
    }

    static var token: String {
        if let value = ProcessInfo.processInfo.environment["ALDUS_PALACE_API_TOKEN"],
           !value.isEmpty
        {
            return value
        }

        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: keychainService,
            kSecAttrAccount: keychainAccount,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let value = String(data: data, encoding: .utf8)
        else {
            return ""
        }
        return value
    }
}

struct APIClient {
    var baseURL: URL = APIConfiguration.baseURL
    var token: String = APIConfiguration.token

    private func request<T: Decodable>(
        _ method: String,
        path: String,
        body: Data? = nil
    ) async throws -> T {
        // Support paths with query string, e.g. "v1/clarifications?status=pending"
        let url: URL
        if path.contains("?"),
           let composed = URL(string: path, relativeTo: baseURL.appending(path: "/"))?.absoluteURL
        {
            url = composed
        } else if let composed = URL(string: path, relativeTo: baseURL.appending(path: "/"))?.absoluteURL {
            url = composed
        } else {
            url = baseURL.appending(path: path)
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = body

        let data: Data
        let resp: URLResponse
        do {
            (data, resp) = try await URLSession.shared.data(for: req)
        } catch let urlError as URLError {
            // Keep the underlying URLError code so callers can distinguish
            // transient transport failures (offline/timeout) from HTTP errors.
            throw APIError.transport(code: urlError.code.rawValue)
        } catch {
            throw APIError.transport(code: 0)
        }
        guard let http = resp as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        // DELETE/empty-body endpoints may return {}
        if http.statusCode == 204 {
            if let empty = try? JSONDecoder().decode(T.self, from: Data("{}".utf8)) {
                return empty
            }
        }
        guard (200 ... 299).contains(http.statusCode) else {
            throw APIError.http(status: http.statusCode, message: Self.friendlyServerError(data: data, status: http.statusCode))
        }
        if data.isEmpty, let empty = try? JSONDecoder().decode(T.self, from: Data("{}".utf8)) {
            return empty
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// Prefer JSON `error` field; never dump full Zod blobs to the user.
    private static func friendlyServerError(data: Data, status: Int) -> String {
        if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if let err = obj["error"] as? String, !err.isEmpty {
                if err.contains("invalid_type") || err.contains("Expected number") {
                    return "理解结果格式异常，请再发一次；若持续失败请检查 API 日志。"
                }
                if err.count > 180 {
                    return String(err.prefix(160)) + "…"
                }
                return err
            }
            if let msg = obj["message"] as? String, !msg.isEmpty {
                return msg
            }
        }
        let raw = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if raw.isEmpty { return "请求失败（HTTP \(status)）" }
        if raw.count > 180 { return String(raw.prefix(160)) + "…" }
        return raw
    }

    func me() async throws -> APIUser {
        let env: MeEnvelope = try await request("GET", path: "v1/me")
        return env.user
    }

    /// Progressive capture: local rules first (fast). Call `enrichInput` when `enriching == true`.
    func submitInput(content: String, mode: String = "progressive") async throws -> InputResult {
        let payload = try JSONEncoder().encode(
            InputCreate(content: content, source: "text", process: true, mode: mode)
        )
        return try await request("POST", path: "v1/inputs", body: payload)
    }

    /// Background AI pass — replaces local derivatives for this input.
    func enrichInput(id: String) async throws -> InputResult {
        try await request(
            "POST",
            path: "v1/inputs/\(id)/enrich",
            body: Data("{}".utf8)
        )
    }

    /// Poll input until AI enrich finishes (or timeout). Used as client fallback.
    func waitForEnrichedInput(id: String, timeoutSeconds: Double = 90) async throws -> InputResult {
        let deadline = Date().addingTimeInterval(timeoutSeconds)
        var lastError: Error?
        while Date() < deadline {
            do {
                // Prefer explicit enrich if still local; server is idempotent when already processed
                let status = try await inputStatus(id: id)
                if status.processing_status == "processed" || status.stage == "enriched" {
                    return status
                }
                if status.enrich_failed == true {
                    throw APIError.server(status.error ?? "AI 深化未完成")
                }
                if status.processing_status == "local" || status.processing_status == "enriching" {
                    // Try enrich once; if server already running, may 502 — then poll GET
                    do {
                        let enriched = try await enrichInput(id: id)
                        if enriched.processing_status == "processed" || enriched.stage == "enriched" {
                            return enriched
                        }
                    } catch {
                        lastError = error
                    }
                }
            } catch {
                lastError = error
            }
            try await Task.sleep(nanoseconds: 800_000_000)
        }
        if let lastError { throw lastError }
        throw APIError.server("AI 理解超时")
    }

    /// Lightweight status + card rebuild from stored objects if needed.
    func inputStatus(id: String) async throws -> InputResult {
        struct Detail: Decodable {
            let raw_input: RawInputRow?
            let thoughts: [Thought]?
            let commitments: [Commitment]?
            let decisions: [DecisionItem]?
            let memories: [MemoryItem]?
        }
        struct RawInputRow: Decodable {
            let id: String?
            let processing_status: String?
            let error_message: String?
        }
        let detail: Detail = try await request("GET", path: "v1/inputs/\(id)")
        let status = detail.raw_input?.processing_status ?? "pending"
        let enrichment = EnrichmentState.resolve(
            processingStatus: status,
            errorMessage: detail.raw_input?.error_message
        )
        let stage: String = {
            switch status {
            case "processed": return "enriched"
            case "local", "enriching": return "local"
            default: return status
            }
        }()
        let thoughts = detail.thoughts ?? []
        let commitments = detail.commitments ?? []
        let memories = (detail.memories ?? []).filter { $0.status == "candidate" }
        var parts: [String] = [status == "processed" ? "已理解" : "已记下"]
        if !thoughts.isEmpty { parts.append("\(thoughts.count) 条想法") }
        if !commitments.isEmpty { parts.append("\(commitments.count) 件要做") }
        if !memories.isEmpty { parts.append("\(memories.count) 条将记住") }
        let card = ActionCard(
            summary: parts.joined(separator: " · "),
            thoughts: thoughts,
            commitments: commitments,
            decisions: detail.decisions ?? [],
            memory_candidates: memories,
            clarifications: [],
            project_match: nil,
            project_suggestion: nil,
            warnings: [],
            source_input_id: id,
            is_enriching: enrichment.isEnriching,
            stage: stage
        )
        return InputResult(
            id: id,
            processing_status: status,
            action_card: card,
            error: enrichment.terminalError,
            stage: stage,
            enriching: enrichment.isEnriching,
            enrich_failed: enrichment.terminalError != nil
        )
    }

    func thoughts() async throws -> [Thought] {
        let env: ListEnvelope<Thought> = try await request("GET", path: "v1/thoughts")
        return env.items
    }

    func commitments() async throws -> [Commitment] {
        var items: [Commitment] = []
        var cursor: String?
        repeat {
            var path = "v1/commitments?limit=100"
            if let cursor,
               let encoded = cursor.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)
            {
                path += "&cursor=\(encoded)"
            }
            let env: PagedListEnvelope<Commitment> = try await request("GET", path: path)
            items.append(contentsOf: env.items)
            cursor = env.next_cursor
        } while cursor != nil
        return items
    }

    func rebuildCommitmentClassifications() async throws -> WorkClassificationRebuild {
        try await request(
            "POST",
            path: "v1/commitment-classifications/rebuild",
            body: Data("{}".utf8)
        )
    }

    func overrideCommitmentClassification(id: String, groupKey: String) async throws {
        struct Body: Encodable { let group_key: String }
        struct Resp: Decodable {
            struct Classification: Decodable { let commitment_id: String }
            let classification: Classification
        }
        let payload = try JSONEncoder().encode(Body(group_key: groupKey))
        let _: Resp = try await request(
            "PATCH",
            path: "v1/commitments/\(id)/classification",
            body: payload
        )
    }

    func memories() async throws -> [MemoryItem] {
        let env: ListEnvelope<MemoryItem> = try await request("GET", path: "v1/memories")
        return env.items
    }

    func activity() async throws -> [ActionLogItem] {
        let env: ListEnvelope<ActionLogItem> = try await request("GET", path: "v1/activity")
        return env.items
    }

    func confirmMemory(id: String) async throws {
        struct Ok: Decodable { let memory: MemoryItem? }
        let _: Ok = try await request(
            "POST",
            path: "v1/memories/\(id)/confirm",
            body: Data("{}".utf8)
        )
    }

    func rejectMemory(id: String) async throws {
        struct Ok: Decodable { let ok: Bool? }
        let _: Ok = try await request(
            "POST",
            path: "v1/memories/\(id)/reject",
            body: Data("{}".utf8)
        )
    }

    func concepts() async throws -> [ConceptItem] {
        let env: ListEnvelope<ConceptItem> = try await request("GET", path: "v1/concepts")
        return env.items
    }

    func resolveClarification(id: String, optionId: String) async throws -> Commitment? {
        struct Body: Encodable { let option_id: String }
        struct Resp: Decodable {
            let ok: Bool?
            let commitment: Commitment?
        }
        let payload = try JSONEncoder().encode(Body(option_id: optionId))
        let resp: Resp = try await request(
            "POST",
            path: "v1/clarifications/\(id)/resolve",
            body: payload
        )
        return resp.commitment
    }

    func pendingClarifications() async throws -> [Clarification] {
        let env: ListEnvelope<Clarification> = try await request(
            "GET",
            path: "v1/clarifications?status=pending"
        )
        return env.items
    }

    func today() async throws -> TodayPayload {
        try await request("GET", path: "v1/today")
    }

    func planToday(planVersion: String = UUID().uuidString) async throws -> PlanTodayResponse {
        struct Body: Encodable { let plan_version: String }
        let payload = try JSONEncoder().encode(Body(plan_version: planVersion))
        return try await request("POST", path: "v1/plan/today", body: payload)
    }

    func arrangeToday(id: String) async throws -> TodayCommitment {
        struct Resp: Decodable { let commitment: TodayCommitment }
        let resp: Resp = try await request(
            "POST",
            path: "v1/commitments/\(id)/arrange-today",
            body: Data("{}".utf8)
        )
        return resp.commitment
    }

    func removeFromToday(id: String) async throws {
        struct Resp: Decodable { let ok: Bool }
        let _: Resp = try await request(
            "POST",
            path: "v1/commitments/\(id)/remove-from-today",
            body: Data("{}".utf8)
        )
    }

    func completeCommitment(id: String) async throws -> TodayCommitment {
        struct Resp: Decodable { let commitment: TodayCommitment }
        let resp: Resp = try await request("POST", path: "v1/commitments/\(id)/complete")
        return resp.commitment
    }

    func startCommitment(id: String) async throws -> TodayCommitment {
        struct Resp: Decodable { let commitment: TodayCommitment }
        let resp: Resp = try await request("POST", path: "v1/commitments/\(id)/start")
        return resp.commitment
    }

    struct ConvertResult {
        let thought: Thought
        let commitment: Commitment
        let alreadyExists: Bool
        let message: String?
    }

    func convertThoughtToCommitment(id: String) async throws -> ConvertResult {
        struct Resp: Decodable {
            let thought: Thought
            let commitment: Commitment
            let already_exists: Bool?
            let message: String?
        }
        let resp: Resp = try await request(
            "POST",
            path: "v1/thoughts/\(id)/convert-to-commitment",
            body: Data("{}".utf8)
        )
        return ConvertResult(
            thought: resp.thought,
            commitment: resp.commitment,
            alreadyExists: resp.already_exists == true,
            message: resp.message
        )
    }

    func cancelCommitment(id: String) async throws {
        struct Resp: Decodable { let commitment: Commitment? }
        let _: Resp = try await request(
            "POST",
            path: "v1/commitments/\(id)/cancel",
            body: Data("{}".utf8)
        )
    }

    func dedupeCommitments() async throws -> Int {
        struct Resp: Decodable { let cancelled_count: Int }
        let resp: Resp = try await request(
            "POST",
            path: "v1/commitments/dedupe",
            body: Data("{}".utf8)
        )
        return resp.cancelled_count
    }

    func rewriteCommitmentTitles() async throws -> Int {
        struct Resp: Decodable { let updated_count: Int }
        let resp: Resp = try await request(
            "POST",
            path: "v1/commitments/rewrite-titles",
            body: Data("{}".utf8)
        )
        return resp.updated_count
    }

    func projects() async throws -> [ProjectItem] {
        let env: ListEnvelope<ProjectItem> = try await request("GET", path: "v1/projects")
        return env.items
    }

    func createProject(
        name: String,
        description: String?,
        brief: String? = nil,
        aliases: [String]
    ) async throws -> ProjectItem {
        struct Body: Encodable {
            let name: String
            let description: String?
            let brief: String?
            let aliases: [String]
        }
        struct Resp: Decodable { let project: ProjectItem }
        let payload = try JSONEncoder().encode(
            Body(name: name, description: description, brief: brief, aliases: aliases)
        )
        let resp: Resp = try await request("POST", path: "v1/projects", body: payload)
        return resp.project
    }

    func projectDetail(id: String) async throws -> ProjectDetail {
        try await request("GET", path: "v1/projects/\(id)")
    }

    func relinkProject(id: String) async throws -> (Int, Int) {
        struct Resp: Decodable {
            let linked_thoughts: Int
            let linked_commitments: Int
        }
        let resp: Resp = try await request(
            "POST",
            path: "v1/projects/\(id)/relink",
            body: Data("{}".utf8)
        )
        return (resp.linked_thoughts, resp.linked_commitments)
    }

    // MARK: - Update / Delete

    func updateThought(id: String, title: String?, content: String) async throws -> Thought {
        struct Body: Encodable {
            let title: String?
            let content: String
        }
        struct Resp: Decodable { let thought: Thought }
        let payload = try JSONEncoder().encode(Body(title: title, content: content))
        let resp: Resp = try await request("PATCH", path: "v1/thoughts/\(id)", body: payload)
        return resp.thought
    }

    func deleteThought(id: String) async throws {
        struct Ok: Decodable { let ok: Bool? }
        let _: Ok = try await request("DELETE", path: "v1/thoughts/\(id)")
    }

    func updateCommitment(id: String, title: String, optimizedContent: String?) async throws -> Commitment {
        struct Body: Encodable {
            let title: String
            let optimized_content: String?
        }
        struct Resp: Decodable { let commitment: Commitment }
        let payload = try JSONEncoder().encode(Body(title: title, optimized_content: optimizedContent))
        let resp: Resp = try await request("PATCH", path: "v1/commitments/\(id)", body: payload)
        return resp.commitment
    }

    func deleteCommitment(id: String) async throws {
        struct Ok: Decodable { let ok: Bool? }
        let _: Ok = try await request("DELETE", path: "v1/commitments/\(id)")
    }

    func updateMemory(id: String, content: String) async throws -> MemoryItem {
        struct Body: Encodable { let content: String }
        struct Resp: Decodable { let memory: MemoryItem }
        let payload = try JSONEncoder().encode(Body(content: content))
        let resp: Resp = try await request("PATCH", path: "v1/memories/\(id)", body: payload)
        return resp.memory
    }

    func deleteMemory(id: String) async throws {
        struct Ok: Decodable { let ok: Bool? }
        let _: Ok = try await request("DELETE", path: "v1/memories/\(id)")
    }

    func updateProject(
        id: String,
        name: String,
        description: String?,
        brief: String? = nil,
        aliases: [String]
    ) async throws -> ProjectItem {
        struct Body: Encodable {
            let name: String
            let description: String?
            let brief: String?
            let aliases: [String]
        }
        struct Resp: Decodable { let project: ProjectItem }
        let payload = try JSONEncoder().encode(
            Body(name: name, description: description, brief: brief, aliases: aliases)
        )
        let resp: Resp = try await request("PATCH", path: "v1/projects/\(id)", body: payload)
        return resp.project
    }

    func deleteProject(id: String) async throws {
        struct Ok: Decodable { let ok: Bool? }
        let _: Ok = try await request("DELETE", path: "v1/projects/\(id)")
    }
}

enum APIError: LocalizedError {
    case invalidResponse
    /// URLError transport failure (offline / timeout / cannot connect). code 0 = unknown.
    case transport(code: Int)
    /// Non-2xx HTTP response with a user-friendly message.
    case http(status: Int, message: String)
    /// Client-side semantic error (e.g. AI enrichment wait timed out).
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse: return L10n.Error.invalidResponse
        case .transport(let code):
            return code == 0 ? L10n.Error.cannotConnect : "\(L10n.Error.cannotConnect)（\(code)）"
        case .http(_, let message): return message
        case .server(let s): return s
        }
    }
}

private struct InputCreate: Encodable {
    let content: String
    let source: String
    let process: Bool
    let mode: String
}

private struct MeEnvelope: Decodable {
    let user: APIUser
}

private struct ListEnvelope<T: Decodable>: Decodable {
    let items: [T]
}

private struct PagedListEnvelope<T: Decodable>: Decodable {
    let items: [T]
    let total: Int?
    let next_cursor: String?
}
