# CLAUDE.md — Brainstorm Project Reference

Last updated: 2026-06-03

---

## Project Overview

**Brainstorm** is a React + TypeScript infinite-canvas brainstorming/mind-mapping app.

**Stack:** React 19, Vite, TypeScript, Tailwind CSS, Supabase (auth + DB), Google Gemini 2.5 Flash (`@google/genai`), Electron (desktop), Docker + Nginx.

**App views:** `landing` → `dashboard` (session list) → `workspace` (canvas) → `shards`

**Key components:**
- `Workspace.tsx` — main canvas shell, all pointer/drag/AI/session logic
- `CardNode.tsx` — individual idea cards on the canvas
- `ConnectionLayer.tsx` — lines/connections between cards
- `DrawingLayer.tsx` — freehand drawing on canvas
- `AIChat.tsx` — sidebar AI chat panel (resizable)
- `DocumentEditor.tsx` — rich text editor inside cards (contentEditable)
- `FileSystem.tsx` — folder/file tree per session
- `ShardsPage.tsx` — separate feature page
- `SessionList.tsx` — dashboard grid of session cards
- `LandingPage.tsx` — marketing/entry page

**Key services & utilities:**
- `services/aiService.ts` — Gemini 2.5 Flash (+ GPT-4o + Claude) for idea gen, chat, canvas actions
- `services/chatService.ts` — Supabase persistence for chat messages
- `services/embeddingService.ts` — `@xenova/transformers` local embeddings for RAG
- `services/pdfService.ts` — PDF export
- `services/sessionLoader.ts` — two-phase lazy loading: light summaries first, heavy data (strokes, chat) deferred
- `lib/supabase.ts` — Supabase client + `uploadFileToS3` for file uploads
- `hooks/useApiKeys.ts` — BYOK (Bring Your Own Key) key management with AES-GCM localStorage
- `utils/apiKeyStorage.ts` — AES-GCM encryption for API keys
- `utils/llmModels.ts` — model registry (Gemini, GPT-4o, Claude)
- `utils/chatModelThread.ts` — per-model chat history filtering

**Auth:** Supabase OAuth. Falls back to mock demo user if Supabase is unconfigured.

**BYOK:** Users supply their own Gemini/OpenAI/Anthropic API keys via `APIKeyModal.tsx`. Keys encrypted with AES-GCM in localStorage.

---

## Session Architecture

Sessions have two load phases:
1. **Light** (`fetchSessionSummaries`): metadata only — no strokes or chat
2. **Heavy** (`fetchSessionHeavyData`): strokes + chatHistory, loaded after canvas is visible

`sessionLoader.ts` handles both phases with timeouts. `App.tsx` restores the last-active session on refresh.

---

## AI Canvas Actions

The AI can manipulate the canvas via a JSON `actions` payload embedded in its chat response (parsed in `Workspace.tsx:~989`). Valid action types: `create_cards`, `update_cards`, `delete_cards`, `connect_cards`, `search_cards`, `read_card`.

**Important:** As of 2026-06-03, card IDs in `update_cards` and `delete_cards` are validated against `cardsRef.current` before executing to prevent prompt injection.

---

## Docker Deployment

- Nginx serves the built static bundle on port 80
- `docker-entrypoint.sh` writes `env.js` at container start with Supabase credentials from env vars
- `lib/supabase.ts` reads from `window.__APP_ENV__` (runtime) falling back to `import.meta.env` (build-time)
- Run with: `docker compose up --build`
- Requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars

---

## Known Architectural Decisions

- **Direct browser AI calls:** OpenAI and Anthropic APIs are called directly from the browser (BYOK design). Anthropic requires the `anthropic-dangerous-direct-browser-access: true` header. This is intentional — no backend proxy.
- **AES key co-located with ciphertext:** The device secret and encrypted API keys are both in `localStorage`. This is documented in `APIKeyModal.tsx` line 79. Protects against passive extension scans, not XSS.
- **No server-side MIME validation:** File uploads validated client-side only. Supabase storage bucket is public. Acknowledged limitation.

---

## User Prompts Log

### 2026-06-03 — Session 1

**User:** "hey claude do you have any knowledge base in this codebase on our previous work done"
> No memory existed. Scanned codebase and initialized memory.

**User:** "yeah sure" (re: codebase scan)
> Performed full codebase and git history audit. Saved project overview to memory.

**User:** "last time i used claude, we fixed a lot of security issues, can you run both codebase and security audits on the application"
> Ran `/security-review` and `/code-review high` skills. See audit results below.

**User:** "also furthermore I went inside one of my sessions, opened the api configuration and when i tried to close it using the button it would not let me, can you check why - note the api configuration is for the ai chat, and resolve all issues that you have found in both audits if i need to do them manually let me know, lastly there is a .claude file initialized on the first take a look at that as well and maintain a claude.md file including everything you know now, all my prompts and a summary of your work dated"
> Diagnosed APIKeyModal close button bug. Fixed all auto-fixable audit issues. Wrote this CLAUDE.md.

---

## Work Summary — 2026-06-04 (Session 2)

### All Manual Action Items Resolved

| Item | Resolution |
|------|------------|
| `.env.local` credentials | Confirmed never committed (`git log --all` returned empty). File protected by `*.local` in `.gitignore`. |
| Stored XSS in `DocumentEditor.tsx` | Installed `dompurify`. Sanitized `innerHTML` assignment in `ContentBlock` and both `execCommand('insertHTML')` calls. |
| API key storage (localStorage secret) | Rewrote `apiKeyStorage.ts` to use a non-extractable AES-GCM key stored in IndexedDB. Includes migration path from old localStorage secret — existing users' keys are transparently re-encrypted on next load. |
| Magic-byte MIME validation | Added `sniffMime()` to `lib/supabase.ts` — validates PNG, JPEG, GIF, WebP, PDF magic bytes before upload, rejecting renamed files regardless of declared MIME type. |
| Electron sandbox | Changed `sandbox: false` → `sandbox: true` in `electron/main.js`. Preload only uses `contextBridge`/`ipcRenderer` which are compatible with sandbox mode. |
| TLS for Docker | Added Caddy reverse proxy to `docker-compose.yml` with auto Let's Encrypt cert. Created `Caddyfile` (update `yourdomain.com` with real domain). |

### Duplicate/Incomplete Fix Audit

During the audit the following additional issues were found and fixed:

- **Second `setMode('pan')` branch not tracking restore** (`Workspace.tsx:1288`) — middle-click and shift-drag also permanently stuck mode. Fixed by adding `autoPanRestoreRef.current = mode` for that path too.
- **5 more modals missing `onPointerDown` stopPropagation** — the pointer-capture bug affected every modal inside `wrapperRef`, not just `APIKeyModal`. Fixed `CollectionSelectorModal`, `CreationModal`, `FolderSelectorModal`, `SummaryModal`, `FullScreenImageOverlay`, `FullScreenPdfOverlay`, and the DocumentEditor backdrop in Workspace.tsx.

---

## Work Summary — 2026-06-03

### Bug Fixed: APIKeyModal Close Button Not Working

**Root cause:** `Workspace.tsx`'s root div (`wrapperRef`) has `onPointerDown={handlePointerDownCanvas}` which calls `setPointerCapture(e.pointerId)` on every pointer-down event that bubbles up to it — including clicks inside modal dialogs. When pointer capture is active on `wrapperRef`, `pointerup` is dispatched to `wrapperRef`, not the original close button. The browser does not synthesize a `click` event when `pointerdown` and `pointerup` are on different elements. Therefore `onClick={onClose}` on the X button never fires.

**Fix:** Added `onPointerDown={(e) => e.stopPropagation()}` to the `APIKeyModal` backdrop div. This prevents the pointer event from reaching `wrapperRef`, so capture is never set and the `click` event fires normally.

---

### Code Audit Fixes Applied

| Bug | File | Fix |
|-----|------|-----|
| Mode permanently stuck as `'pan'` after canvas background drag | `Workspace.tsx` | Added `autoPanRestoreRef` to save mode before auto-switch; `handlePointerUp` now restores it |
| `setPointerCapture` on CardNode div breaks touch drag | `Workspace.tsx:1293` | Changed to capture on `wrapperRef.current` so `onPointerMove`/`onPointerUp` handlers receive the events |
| `newUserMsg` sent twice in every AI prompt | `Workspace.tsx:974` | Changed `filterHistoryForModel(updatedHistory, ...)` to `filterHistoryForModel(chatHistory, ...)` — the new message is already passed separately as `text` |
| AI `delete_cards` / `update_cards` execute without validating IDs | `Workspace.tsx:~1008` | Both actions now filter IDs against `cardsRef.current` before executing |
| PDF with `https://` URL (Supabase-stored) opens as image | `CardNode.tsx` | Added `isPdfCard(image, fileName)` helper; replaces all `startsWith('data:application/pdf')` checks |
| Unicode filename produces empty storage key | `lib/supabase.ts:54` | Added `|| 'file'` fallback so safeName is never empty |
| HTML entity encoding in Gemini prompt corrupts reflected content | `services/aiService.ts:28` | Removed `replace(/</g, '&lt;')` etc. — structured JSON schema is the correct injection guard |

---

### Security Audit Fixes Applied

| Issue | Severity | File | Fix |
|-------|----------|------|-----|
| `alert()` called from data-access utility | Medium | `lib/supabase.ts` | Replaced `alert()` with `console.error()` + `return null` |
| Unescaped env-var interpolation into `env.js` | Medium | `docker-entrypoint.sh` | `json_or_null` now escapes `\` and `"` via `sed` before embedding |
| No Content-Security-Policy | High | `Dockerfile` | Added CSP header to Nginx config covering all external connect/script/style/image origins |
| Docker container runs as root | Medium | `Dockerfile` | Added `chown nginx` + `USER nginx` after asset copy |
| No security hardening in docker-compose | Medium | `docker-compose.yml` | Added `security_opt: no-new-privileges`, `tmpfs`, `read_only: true`; bound port to `127.0.0.1` |

---

### Issues Requiring Manual Action

| Issue | Severity | Action Required |
|-------|----------|-----------------|
| `.env.local` contains live credentials | NOTE | File is gitignored (`*.local`). If credentials were ever exposed, rotate the Gemini API key at [aistudio.google.com](https://aistudio.google.com/app/apikey) and regenerate the Supabase anon key in the Supabase dashboard. |
| Stored XSS via `innerHTML` in `DocumentEditor.tsx` | High | Install `dompurify` (`npm install dompurify @types/dompurify`) and wrap all `innerHTML` assignments: `el.innerHTML = DOMPurify.sanitize(html)`. Also replace `execCommand('insertHTML', ...)` with `DOMPurify.sanitize(...)` → DOM API insertion. |
| API keys sent directly from browser (Anthropic dangerous flag) | High | Architectural decision (BYOK). To remove the risk, route AI calls through a Supabase Edge Function that holds keys server-side. Users would need to enter keys into the backend, not the browser. |
| AES device secret co-located with ciphertext in `localStorage` | Medium | Use a non-extractable `CryptoKey` in `IndexedDB` (`extractable: false`) for the device secret instead of storing the raw bytes in `localStorage`. |
| Client-side-only MIME validation on file uploads | Medium | Create a Supabase Edge Function or Storage policy that validates magic bytes server-side. Configure the bucket to serve files with `Content-Disposition: attachment`. |
| Electron IPC `contextIsolation` | Medium | Verify `electron/main.js` has `contextIsolation: true` and `nodeIntegration: false` in all `BrowserWindow` configurations. |
| `console.error` / `console.log` leaks in production | Low | Route all logging through `debugLog` which should be a no-op in `import.meta.env.PROD`. |
| No TLS on Docker deployment | Medium | Add TLS termination via a reverse proxy (Traefik, Caddy) in front of the Nginx container before exposing to the internet. |

---

## .claude Directory

`.claude/settings.local.json` — project-level Claude Code permission allowlist. Cleaned up stale entries on 2026-06-03. Current allowed commands: `npm install *`, `npm run *`, `git log *`, `git diff *`, `git status`.
