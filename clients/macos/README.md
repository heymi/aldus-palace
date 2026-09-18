# macOS reference client

A SwiftUI macOS client for Aldus Palace. This is a **reference client, best effort** —
the supported surface of this repository is the library and HTTP API.

## Requirements

- macOS 14+
- Xcode 15+ (verified with Xcode 27 beta)
- API running at `http://127.0.0.1:8787`

## Build

```bash
brew install xcodegen          # if needed
cd clients/macos/AldusPalace
xcodegen generate               # regenerate AldusPalace.xcodeproj after editing project.yml
xcodebuild -scheme AldusPalace -destination 'platform=macOS' build
```

Or open `clients/macos/AldusPalace/AldusPalace.xcodeproj` in Xcode, select **My Mac**, and Run.
Local signing with **Sign to Run Locally / Personal Team** is enough.

If terminal `xcodebuild` fails because `xcode-select` points at Command Line Tools:

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
```

## Running the API

```bash
pnpm install
pnpm dev                          # apps/server on http://127.0.0.1:8787
```

## Auth

The client reads its bearer token from the login Keychain
(service `app.alduspalace.AldusPalace.api`, account `api`).

For local development you can override both the endpoint and the token with
environment variables:

- `ALDUS_PALACE_API_URL` (default `http://127.0.0.1:8787`)
- `ALDUS_PALACE_API_TOKEN`
