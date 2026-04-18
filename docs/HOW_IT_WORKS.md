# How AirType Works

## Demo

<video src="./demo.webm" controls width="720">
  Your browser doesn't render inline video — <a href="./demo.webm">download the recording</a>.
</video>

> If GitHub doesn't play the file inline, click [demo.webm](./demo.webm) to download it.

## The hot path (push-to-talk → pasted text)

Audio never touches the backend. The desktop app talks to Groq directly; the backend is only involved for auth and post-hoc storage.

1. User holds **`fn`** (push-to-talk). A native macOS `CGEventTap` module emits `down` to the Electron main process.
2. The recording widget starts `MediaRecorder` at 16 kHz mono (Opus in WebM).
3. User releases `fn`.
4. Widget POSTs audio directly to `api.groq.com/v1/audio/transcriptions` (Whisper Large v3 Turbo). The Groq API key was fetched once at startup via `/api/config`.
5. Widget POSTs the raw text directly to `api.groq.com/v1/chat/completions` (Llama 4 Scout) with the language-aware cleanup prompt.
6. Widget simulates **`Cmd+V`** in the focused app — cleaned text lands at the cursor.
7. Widget fires-and-forgets `POST /api/transcriptions/save` so history and usage stats stay in sync (doesn't block paste).

## Authentication (one-time, at install)

Exchange-code + client-nonce flow. Tokens never appear in the redirect URL, browser history, or server logs.

1. User clicks **Sign in with Google**.
2. Desktop generates a random `clientNonce`, persists it to `electron-store`, fetches an OAuth URL from `/api/auth/google/login?clientNonce=…`, and opens it in the system browser.
3. User authenticates with Google → Google redirects to `/api/auth/google/callback`.
4. Backend validates state, exchanges Google's code for user info, upserts the user in MongoDB, mints JWTs, and stores them under a **single-use exchange code** with a 2-minute TTL.
5. Backend redirects to `airtype://auth/callback?code=<exchangeCode>&nonce=<clientNonce>`.
6. Desktop `open-url` handler validates the nonce against its stored copy (CSRF defence) and POSTs `/api/auth/exchange`.
7. Tokens are saved to `electron-store`. Subsequent API calls use the JWT; refresh rejects suspended users.

## Why this shape?

- **Latency is the product.** Every extra hop is audible. Routing audio through the backend would add a round-trip plus bandwidth for a payload we don't need to inspect — so we don't.
- **Backend stays stateless on the hot path.** It handles auth, settings, and history; it never sees audio bytes. That also means horizontal scaling doesn't need sticky sessions or audio buffering.
- **Tokens out of URLs.** The exchange-code pattern keeps JWTs off Google's redirect, out of browser history, and out of `access.log` — at the cost of one extra POST.

## Related docs

- [README.md](../README.md) — features, setup, API reference
- [SETUP.md](../SETUP.md) — first-run environment config
- [NEXT_STEPS.md](../NEXT_STEPS.md) — roadmap
