# Security

## Posture: single-user and self-hosted

Aldus Palace stores **highly personal data** — thoughts, commitments, memories
and project context. Today's runtime is explicitly **single-user**:

- one static bearer token (`DEV_AUTH_TOKEN`) guards `/v1/*`
- no user accounts, no multi-tenant isolation, no per-row encryption
- the Cloudflare deployment stores everything in **one named Durable Object**

**Do not expose the server to the public internet.** The intended deployment is
localhost, a private network, or a tunnel with your own authentication in front
of it. If you deploy to a public host, treat every record in the database as
public and change `DEV_AUTH_TOKEN` from the example value first.

## Threat model (v0.x)

| In scope | Out of scope (known) |
|---|---|
| Bearer token leakage through config or logs | protection from a compromised host |
| SQL injection through input content | at-rest encryption of the database |
| Model output corrupting stored data | multi-tenant isolation |
| Prompt-injection *within* a capture affecting stored objects | preventing the model from reading the capture you sent it |

## Design rules that reduce risk

- All SQL goes through bound parameters; there is no string-concatenated SQL.
- Model output is validated with `zod` and then gated by server-side invariants.
- The AI pass writes only *derived* fields; `raw_inputs.content` is immutable.
- Memory passes a published gate: a high-confidence rule the user states
  activates on capture, while an inferred principle and anything below the gate
  wait as a candidate. Every activation is reversible.
- Permissions are scopes, and absence means no: Memory stays private until a
  memory scope is granted.
- `prepareCloudPayload` redacts project names, money, emails and phone numbers by
  data level, and level 4 does not leave the device.
- `purgeUserData` deletes every row the user owns in one transaction, after an
  explicit confirmation.
- Every mutation writes an `action_log` entry with a reason.

## Forward-looking design

Two parts of the privacy architecture are still design: **local encrypted
storage** (Keychain / Secure Enclave plus an encrypted database) and **routing
every cloud call through the gateway**, which the pipeline can do but the
provider layer does not enforce yet. Both are tracked in
[`ROADMAP.md`](ROADMAP.md), and the full intent is in
[`docs/INTELLIGENCE.md`](docs/INTELLIGENCE.md).

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting
(**Security → Report a vulnerability**) on the repository, including:

- affected version or commit
- reproduction steps
- impact and any suggested fix

You can expect an acknowledgement within a few days. Please allow time for a fix
before public disclosure.
