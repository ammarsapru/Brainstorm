# CLAUDE.md — Brainstorm Project Reference

Last updated: 2026-06-07

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

## Project Knowledge Files

These files exist in the repo root and contain important operational context:

| File | Purpose |
|------|---------|
| `CLAUDE.md` | This file — AI assistant reference, session log, architecture notes |
| `CURSOR_SUMMARY.md` | Deep code audit from Cursor session — 28 issues catalogued, architecture map, feature→code map |
| `IMPLEMENTATION_PLAN.md` | Active engineering tracker (last updated May 2026) — completed items, open backlog, phase breakdown |
| `DESKTOP_UPDATE_GUIDE.md` | Electron release workflow — how auto-updates work, publish commands |
| `DESKTOP_APP_INSTRUCTIONS.txt` | End-user instructions for the desktop app |
| `OAUTH_CALLBACK_SETUP.md` | Google OAuth redirect URL setup for Supabase (required for auth to work) |
| `S3_MIGRATION_GUIDE.md` | Supabase Storage migration guide (base64→S3 already done in production) |
| `SUPABASE_SETUP.txt` | Supabase table/RLS setup instructions |
| `SUPABASE_UPDATE.sql` | SQL for schema changes |
| `PRODUCT_BRIEF.txt` | Product vision, audience, positioning, USPs |
| `conv - 2026-02-16.md` | Early session log — DocumentEditor cursor/Enter/drag fixes |
| `electron_build_output.txt` | Local electron build output (reference — code signing fails on Windows without admin symlink privilege, non-blocking) |
| `tsc_errors.txt` | TypeScript errors snapshot — errors are in dead orphan `src/App.tsx` and Vite types; Vite builds fine regardless |

---

## Key Components

| File | Purpose |
|------|---------|
| `App.tsx` | Root — auth, session list, view routing |
| `components/Workspace.tsx` | Main canvas shell — all pointer/drag/AI/session logic (~1960 lines) |
| `components/CardNode.tsx` | Individual idea cards on the canvas |
| `components/ConnectionLayer.tsx` | Lines/connections between cards |
| `components/DrawingLayer.tsx` | Freehand drawing on canvas |
| `components/AIChat.tsx` | Resizable sidebar AI chat panel with markdown rendering |
| `components/DocumentEditor.tsx` | Rich text editor inside cards (contentEditable + DOMPurify) |
| `components/APIKeyModal.tsx` | BYOK key entry modal |
| `components/FileSystem.tsx` | Folder/file tree per session |
| `components/ShardsPage.tsx` | Shard clipboard feature page (Electron global shortcuts) |
| `components/SessionList.tsx` | Dashboard grid of session cards |
| `components/LandingPage.tsx` | Marketing/entry page |
| `src/App.tsx` | **Dead orphan** — incomplete fragment, not used by `index.tsx`, TypeScript errors expected |

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
| `utils/chatModelThread.ts` | Per-model chat history filtering + model-switch handoff |
| `utils/debugLog.ts` | Logging wrapper (no-op in production) |
| `src/integrations/supabase/sync-engine.ts` | Debounced batch upsert/delete for all session entities |
| `src/integrations/supabase/hooks/use-workspace.ts` | Hook: load session from DB, subscribe sync state |

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

### AI multi-model chat
- Model picker persisted per user (`brainstorm_selected_model:{userId}`)
- Per-model thread isolation: each message stores `model` field; UI filters by selected model
- Model switch triggers handoff: outgoing model summarizes thread → summary saved as first message on new model's thread
- All three providers (Gemini, GPT-4o, Claude) wired via `aiService.ts`

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
- Nginx listens on **port 8080** (not 80 — runs without root)
- Security: CSP header, `no-new-privileges`, `tmpfs` for cache/log/run dirs
- **Dev/local:** `docker compose up --build` — exposes port 8080 directly
- **Production TLS:** `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` — adds Caddy in front; update `yourdomain.com` in `Caddyfile`
- Note: `USER nginx` and `read_only: true` were removed (`859a9c6`) — nginx must write `env.js` at startup and tmpfs mounts replace read_only restriction

### Electron
- Workflow: `.github/workflows/electron.yml`
- Platforms: Windows (NSIS), macOS (DMG x64+arm64), Linux (AppImage)
- Push to `main`: builds and uploads as workflow artifacts
- Push a `v*` tag: runs `desktop:publish` → creates GitHub Release with installers attached
- Config: `electron-builder.yml` (publish target: `ammarsapru/brainstorm` GitHub repo)
- Dev: `npm run desktop:dev`
- Build locally: `npm run desktop:build`
- **Release update:** Bump `version` in `package.json`, push tag, CI publishes. See `DESKTOP_UPDATE_GUIDE.md`.
- **Local build note:** Windows code signing (`winCodeSign`) requires symlink privileges. Without them the signing step errors but the NSIS installer is still produced. Run as admin or use CI for signed builds.
- Security: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, preload bridge in `electron/preload.cjs`

---

## Known Open Items

| Item | Severity | Status |
|------|----------|--------|
| API keys sent directly from browser (Anthropic dangerous flag) | High | Architectural decision — BYOK by design. Mitigation requires a backend proxy (Supabase Edge Function). |
| Client-side-only MIME validation | Medium | Magic-byte sniffing added client-side. Server-side Supabase Storage policy not yet configured. |
| Master PDF body empty | Medium | `extractTextFromContent` in `pdfService.ts` expects Slate-like children but `DocumentEditor` stores `DocBlock[]` with top-level `.text`. Needs format fix. See `IMPLEMENTATION_PLAN.md` §3.1. |
| Brainstorm button Gemini-only | Medium | `generateRelatedIdeas` always calls Gemini regardless of selected model. Other models' BYOK keys not used here. |
| `CardNode` memo missing `card.content` | Low | Document edits may not refresh canvas preview until another field changes. |
| Duplicate workspace data loader | Low | `use-workspace` and `App` both load session data — single source of truth not yet unified. |
| `console.error`/`console.log` in production | Low | Some raw console calls remain outside `debugLog`. |
| `src/App.tsx` dead orphan | Low | Incomplete fragment with TypeScript errors; not used. Safe to delete eventually. |
| Chat `ON DELETE CASCADE` not verified | Low | Foreign key from `chat_messages` → `sessions` — confirm cascade is set in Supabase. |

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

**Docker container startup fix** (commit `859a9c6`)
Nginx port changed 80→8080 so worker can bind without root. `USER nginx` removed (conflicts with tmpfs and entrypoint writes). `read_only: true` removed (entrypoint must write `env.js` to html dir). Caddy TLS moved to `docker-compose.prod.yml` overlay — base compose is dev-only. `docker-compose.yml` now exposes `8080:8080` directly; production TLS uses the overlay.

---

### 2026-06-07 — Session 3

**"there should be more than just claude.md — familiarize yourself with the project"**
Full codebase scan: discovered 13 additional reference files not mentioned in prior CLAUDE.md (`CURSOR_SUMMARY.md`, `IMPLEMENTATION_PLAN.md`, `DESKTOP_UPDATE_GUIDE.md`, `OAUTH_CALLBACK_SETUP.md`, `S3_MIGRATION_GUIDE.md`, `PRODUCT_BRIEF.txt`, `conv - 2026-02-16.md`, build output/error logs).

Verified current state:
- GitHub remote HEAD = local HEAD = `859a9c6` — fully in sync
- Docker: Dockerfile and compose files match latest commit; nginx port 8080, no USER nginx, no read_only, prod TLS via overlay
- Electron: `main.js` hardened (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`); local build produces NSIS installer; code signing requires admin symlink privilege on Windows
- TypeScript: errors are only in dead `src/App.tsx` orphan and vite types in `lib/supabase.ts` — Vite builds fine
- `IMPLEMENTATION_PLAN.md` contains open backlog not previously tracked in CLAUDE.md — added to Known Open Items

CLAUDE.md updated: Docker section corrected, Project Knowledge Files section added, Known Open Items expanded, memory/project_overview.md refreshed.
