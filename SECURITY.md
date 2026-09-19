# Security

## Posture: single-user and self-hosted

Aldus Palace stores **highly personal data** — thoughts, commitments, memories
and project context — and is built for one person at a time:

- one static bearer token (`DEV_AUTH_TOKEN`) guards `/v1/*`
- one database per person, in one SQLite file or one Cloudflare Durable Object
- the data stays where you put it; there is no vendor cloud in the path

**Do not expose the server to the public internet.** The intended deployment is
localhost, a private network, or a tunnel with your own authentication in front
of it. If you deploy to a public host, change `DEV_AUTH_TOKEN` from the example
value first.

## Protections in place

| Protection | How |
|---|---|
| Bearer token leakage through config or logs | the token is read once and never written to a response |
| SQL injection through input content | every query uses bound parameters |
| Model output corrupting stored data | output is validated with `zod` and gated server-side |
| Prompt injection *within* a capture | the model fills derived fields only; `raw_inputs` is immutable |
| Sensitive data reaching a model | the Privacy Gateway redacts by data level; level 4 stays local |
| Control over what is kept | permissions are scopes, Memory is private by default, and deletion is real |

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

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting
(**Security → Report a vulnerability**) on the repository, including:

- affected version or commit
- reproduction steps
- impact and any suggested fix

You can expect an acknowledgement within a few days. Please allow time for a fix
before public disclosure.
