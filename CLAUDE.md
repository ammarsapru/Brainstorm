# CLAUDE.md — Brainstorm Project Reference

Last updated: 2026-06-04

---

## Project Overview

**Brainstorm** is a React + TypeScript infinite-canvas brainstorming/mind-mapping app. Users create sessions with idea cards on an infinite canvas, connect them, draw freehand, chat with an agentic AI, and edit rich-text documents.

**Live URLs:**
- GitHub Pages: `https://ammarsapru.github.io/Brainstorm/`
- Docker image: `ghcr.io/ammarsapru/brainstorm`
- GitHub repo: `https://github.com/ammarsapru/Brainstorm`

**Stack:** React 19, Vite, TypeScript, Tailwind CSS + `@tailwindcss/typography`, Supabase (auth + DB), Google Gemini 2.5 Flash (`@google/genai`), OpenAI GPT-4o, Anthropic Claude, `marked` (markdown), `dompurify` (XSS), Electron (desktop), Docker + Nginx + Caddy (TLS).

**App views:** `landing` → `dashboard` (session list) → `workspace` (canvas) → `shards`

---

## Key Components

| File | Purpose |
|------|---------|
| `App.tsx` | Root — auth, session list, view routing |
| `components/Workspace.tsx` | Main canvas shell — all pointer/drag/AI/session logic |
| `components/CardNode.tsx` | Individual idea cards on the canvas |
| `components/ConnectionLayer.tsx` | Lines/connections between cards |
| `components/DrawingLayer.tsx` | Freehand drawing on canvas |
| `components/AIChat.tsx` | Resizable sidebar AI chat panel with markdown rendering |
| `components/DocumentEditor.tsx` | Rich text editor inside cards (contentEditable + DOMPurify) |
| `components/APIKeyModal.tsx` | BYOK key entry modal |
| `components/FileSystem.tsx` | Folder/file tree per session |
| `components/ShardsPage.tsx` | Shard clipboard feature page |
| `components/SessionList.tsx` | Dashboard grid of session cards |
| `components/LandingPage.tsx` | Marketing/entry page |

---

## Key Services & Utilities

| File | Purpose |
|------|---------|
| `services/aiService.ts` | Gemini / GPT-4o / Claude — idea gen, chat, canvas actions |
| `services/chatService.ts` | Supabase persistence for chat messages |
| `services/embeddingService.ts` | `@xenova/transformers` local embeddings for RAG search |
| `services/pdfService.ts` | Master PDF export |
| `services/sessionLoader.ts` | Two-phase lazy loading (light summaries → heavy data) |
| `lib/supabase.ts` | Supabase client + `uploadFileToS3` with magic-byte MIME validation |
| `hooks/useApiKeys.ts` | BYOK key management — loads/saves via `apiKeyStorage` |
| `utils/apiKeyStorage.ts` | AES-GCM encryption with non-extractable IndexedDB key |
| `utils/llmModels.ts` | Model registry (Gemini, GPT-4o, Claude) |
| `utils/chatModelThread.ts` | Per-model chat history filtering |
| `utils/debugLog.ts` | Logging wrapper (no-op in production) |

---

## Architecture Notes

### Session loading (two-phase)
1. **Light** (`fetchSessionSummaries`): metadata only — fast dashboard load
2. **Heavy** (`fetchSessionHeavyData`): strokes + chatHistory, deferred until canvas is visible

`App.tsx` restores the last-active session on refresh via `localStorage.last_active_session_id`.

### AI canvas actions
The AI embeds a JSON `actions` array in its response (parsed in `Workspace.tsx`). Valid types: `create_cards`, `update_cards`, `delete_cards`, `connect_cards`, `search_cards`, `read_card`.

Card IDs in `update_cards` / `delete_cards` are validated against `cardsRef.current` before executing (prompt injection protection).

When executing actions, the AI is instructed to respond in **1–3 sentences only** — no card ID lists, no pre-action plans.

### API key storage (post 2026-06-04)
`utils/apiKeyStorage.ts` generates a **non-extractable AES-GCM CryptoKey** stored in IndexedDB (`brainstorm-security` DB, `keys` store). The raw key bytes are never accessible to JavaScript. Existing users migrated transparently on first load — old localStorage-secret-encrypted data is decrypted and re-encrypted with the new IDB key.

### BYOK architecture
OpenAI and Anthropic API calls go directly from the browser. Anthropic requires `anthropic-dangerous-direct-browser-access: true`. This is intentional (no backend proxy). Gemini also called directly via `@google/genai`.

### Modal pointer-event fix
All modals rendered inside `wrapperRef` (the canvas root div with `onPointerDown`) must have `onPointerDown={(e) => e.stopPropagation()}` on their backdrop. Without it, `setPointerCapture` on `wrapperRef` hijacks the pointer and the browser never synthesises a `click` event on modal buttons.

Fixed modals: `APIKeyModal`, `CollectionSelectorModal`, `CreationModal`, `FolderSelectorModal`, `SummaryModal`, `FullScreenImageOverlay`, `FullScreenPdfOverlay`, DocumentEditor backdrop.

---

## Deployment

### GitHub Pages
- Workflow: `.github/workflows/deploy.yml`
- Build env: `GITHUB_PAGES=true` → `vite.config.ts` sets `base: '/Brainstorm/'`
- Secrets needed: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Supabase credentials baked in at build time via `import.meta.env`
- `env.js` script has `onerror` handler — fails silently on non-Docker deployments

### Docker
- Workflow: `.github/workflows/docker.yml` — pushes to `ghcr.io/ammarsapru/brainstorm`
- Tags: `latest` (main branch), semver (on `v*` tags), git SHA
- Runtime env injection: `docker-entrypoint.sh` writes `env.js` with Supabase credentials
- TLS: Caddy reverse proxy (`Caddyfile`) — update `yourdomain.com` with real domain
- Security: CSP header, `USER nginx`, `no-new-privileges`, `read_only: true`, port bound to `127.0.0.1`
- Build: `docker compose up --build` (requires `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` in env)

### Electron
- Workflow: `.github/workflows/electron.yml`
- Platforms: Windows (NSIS), macOS (DMG x64+arm64), Linux (AppImage)
- Push to `main`: builds and uploads as workflow artifacts
- Push a `v*` tag: runs `desktop:publish` → creates GitHub Release with installers attached
- Config: `package.json` `"build"` key (electron-builder)
- Dev: `npm run desktop:dev`
- Build locally: `npm run desktop:build`

---

## Known Open Items

| Item | Severity | Status |
|------|----------|--------|
| API keys sent directly from browser (Anthropic dangerous flag) | High | Architectural decision — BYOK by design. Mitigation requires a backend proxy (Supabase Edge Function). |
| Client-side-only MIME validation | Medium | Magic-byte sniffing added client-side. Server-side Supabase Storage policy not yet configured. |
| `console.error`/`console.log` in production | Low | Some raw console calls remain. Should route through `debugLog` which no-ops in prod. |

---

## .claude Directory

`.claude/settings.local.json` — project-level Claude Code permission allowlist.
Current allowed commands: `npm install *`, `npm run *`, `git log *`, `git diff *`, `git status`, `git add *`.

---

## Session Log

### 2026-06-03 — Session 1

**"hey claude do you have any knowledge base in this codebase on our previous work done"**
No memory existed. Scanned codebase, git history, initialized memory.

**"can you run both codebase and security audits on the application"**
Ran `/security-review` and `/code-review high`. Found 13 security findings and 8 code bugs.

**"resolve all issues that you have found in both audits / maintain a claude.md file"**
Fixed all auto-fixable issues. Wrote initial CLAUDE.md.

Fixes applied:
- APIKeyModal close button broken (root cause: pointer capture on `wrapperRef` — all modal backdrops now stop pointer propagation)
- Stuck pan mode after canvas drag (`autoPanRestoreRef`)
- Touch drag broken (`setPointerCapture` on wrong element → `wrapperRef`)
- Duplicate AI message in every prompt (`updatedHistory` → `chatHistory`)
- AI canvas actions without ID validation (prompt injection)
- PDF https:// URL detection (`isPdfCard` helper)
- Unicode filenames → empty storage keys (`|| 'file'` fallback)
- HTML entities in Gemini prompt corrupting titles
- `alert()` in data-access utility → `console.error`
- `docker-entrypoint.sh` env-var escaping
- Dockerfile: CSP, `USER nginx`, security hardening
- `docker-compose.yml`: `no-new-privileges`, `read_only`, `tmpfs`, port binding

---

### 2026-06-04 — Session 2

**"audit the codebase for duplicate fixes / provide manual action table with instructions"**
Found and fixed two missed issues: second `setMode('pan')` branch not restoring mode; 5 more modals (+ 2 overlays) missing pointer stopPropagation.

Implemented all remaining manual action items:
- DOMPurify installed; all `innerHTML` assignments and `execCommand('insertHTML')` in `DocumentEditor.tsx` sanitized
- `apiKeyStorage.ts` rewritten — non-extractable IndexedDB key, migration from old localStorage secret
- Magic-byte MIME validation (`sniffMime()`) added to `uploadFileToS3`
- Electron `sandbox: true` enabled in `main.js`
- Caddy TLS added to `docker-compose.yml`; `Caddyfile` created

**"the user should be able to copy the response, parse the response, clear the input box on send"**
- Copy button: always visible at bottom of every AI message (was hidden on hover), shows "Copied ✓" feedback for 2s, clipboard fallback for restricted environments
- Markdown rendering: installed `marked` + `@tailwindcss/typography`; AI responses rendered with prose styles (bold, headers, code blocks, lists, blockquotes)
- Input cleared immediately on send; restored if the API call fails

**"when AI performs actions it gives incredibly long responses"**
Added two-layer instruction in `aiService.ts` system prompt:
- Guideline #3: "When performing canvas actions: respond in 1–3 sentences only"
- ACTION RESPONSE RULES block in capabilities section: bans card ID lists, pre-action plans, and verbose changelogs; gives examples of what "brief" looks like

**"update docker and electron build, ensure github is updated, properly configured for github pages / docker / electron"**
- `vite.config.ts`: conditional `base` — `./` for Docker/Electron, `/Brainstorm/` when `GITHUB_PAGES=true`
- `index.html`: all paths made relative (`./`), `env.js` gets `onerror` silent fallback
- `package.json`: full electron-builder config added (appId, platforms, NSIS options, GitHub publish target)
- `.github/workflows/deploy.yml`: fixed — `GITHUB_PAGES=true` added, `GEMINI_API_KEY` removed, environment url moved to correct job
- `.github/workflows/docker.yml`: new — builds + pushes to `ghcr.io` on main push and `v*` tags
- `.github/workflows/electron.yml`: new — Windows/macOS/Linux matrix; artifacts on main push; GitHub Release on `v*` tag
- Committed and pushed: `11d360a` — all three workflows triggered successfully
