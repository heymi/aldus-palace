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
- Memory is never activated without user confirmation.
- Every mutation writes an `action_log` entry with a reason.

## Forward-looking design

The privacy architecture this project is being built toward — data levels, a
Privacy Gateway with redaction, local encrypted storage, progressive permissions,
an Action Gate and a real delete policy — is in
[`docs/INTELLIGENCE.md`](docs/INTELLIGENCE.md). It is design, not the current
posture described above.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting
(**Security → Report a vulnerability**) on the repository, including:

- affected version or commit
- reproduction steps
- impact and any suggested fix

You can expect an acknowledgement within a few days. Please allow time for a fix
before public disclosure.
