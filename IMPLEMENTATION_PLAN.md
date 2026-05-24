# Brainstorm Implementation Plan

**Last updated:** May 20, 2026

This document replaces `IMPLEMENTATION_PLAN_STATUS.md` and tracks active engineering work.

---

## Recently completed (May 2026)

| Item | Status |
|------|--------|
| Lightweight dashboard session load (no strokes / full card blobs) | Done |
| Stop refetch on `TOKEN_REFRESHED` (tab focus refresh) | Done |
| Lazy-load `Workspace` bundle (faster login on GitHub Pages) | Done |
| Fixed loading overlay scroll (`fixed` + `overflow: hidden` on body) | Done |
| GPT-4o + Claude 3.5 in AI chat with provider icons | Done |
| Unified model selection + per-provider API key prompts | Done |
| API keys encrypted at rest (AES-GCM in browser) | Done |
| Chat history persisted to `chat_messages` + `chat_attachments` | Done |
| AI chat UI redesign (light/violet theme) | Done |
| Electron hardened (`contextIsolation`, preload bridge) | Done |
| Dynamic import for `@xenova/transformers` (deferred chunk) | Done |

---

## Phase 1 — Performance & stability

### 1.1 Login / dashboard load time
- [x] `fetchSessionSummaries()` — exclude `strokes`, skip connections/files on dashboard
- [x] Full session fetch only when opening a canvas (`fetchFullSession`)
- [x] `React.lazy(Workspace)` to avoid loading canvas + transformers on dashboard
- [ ] Add Supabase RPC or `count` query for card totals (avoid loading preview cards for huge accounts)
- [ ] Service worker / asset precache strategy for GitHub Pages CDN

### 1.2 Tab refresh / reload
- [x] Ignore `TOKEN_REFRESHED` in `onAuthStateChange`
- [x] Dedupe in-flight `fetchSessions` with ref guard
- [ ] Persist dashboard scroll position without full remount

### 1.3 Workspace open
- [x] Defer embedding sync via `requestIdleCallback`
- [ ] Remove duplicate load: `use-workspace` vs `App` full session (single source of truth)
- [ ] Paginate or cap `strokes` JSONB size per session

---

## Phase 2 — AI platform

### 2.1 Multi-LLM
- [x] Chat: Gemini, GPT-4o, Claude 3.5 Sonnet
- [x] Model picker persisted per user (`brainstorm_selected_model:{userId}`)
- [ ] Brainstorm button: route through selected text model (today: Gemini-only `generateRelatedIdeas`)
- [ ] Session icon/banner: document Gemini Imagen requirement in UI when non-Gemini model selected

### 2.2 API key security
- [x] AES-GCM encryption in `utils/apiKeyStorage.ts`
- [x] Legacy plaintext keys auto-migrated on read
- [ ] Optional: WebAuthn or user passphrase for encryption secret (stronger than device-only key)
- [ ] Never log key material in `debugLog` (audit pass)

### 2.3 Chat persistence
- [x] `loadChatHistory` / `saveChatMessage` in `services/chatService.ts`
- [x] Save on each user + assistant message from `Workspace`
- [ ] Delete chat history when session deleted (cascade or explicit delete)
- [ ] Load chat in `mapSessionData` for dashboard badge without flag hack

---

## Phase 3 — UX & exports

### 3.1 Master PDF
- [ ] Fix `extractTextFromContent` for `DocBlock[]` format from `DocumentEditor`
- [ ] Appendix for image/PDF cards
- [ ] User toast with section count on success

### 3.2 Document / card polish
- [ ] `CardNode` memo: include `card.content` in comparator
- [ ] Reversible `--bp` / `--nl` macros in card editor

---

## Phase 4 — Desktop & docs

### 4.1 Electron security (explained)
**Previous risk:** `nodeIntegration: true` + `contextIsolation: false` let any script in the renderer call Node.js (`fs`, `child_process`, etc.). A single XSS in the React app could compromise the full machine.

**Current fix:** `contextIsolation: true`, `nodeIntegration: false`, and `electron/preload.cjs` exposing only `electronAPI` (open external URL, shard shortcuts).

### 4.2 README
- [x] Stack corrected to Vite + React (not Next.js)
- [ ] Docker port 8080 vs README port 3000 alignment

---

## Database: chat history wiring

Your schema already supports persistence:

```
sessions ──< chat_messages ──< chat_attachments (optional)
```

**`chat_messages` columns:** `id`, `session_id`, `role`, `text`, `timestamp`, `model` (text, nullable until migration)

Run `supabase/chat_messages_migration.sql` in Supabase SQL Editor.

**Per-model threads (implemented):**

1. Each message stores `model` (LLM id). Chat UI shows only messages for the selected model.
2. Switching models → outgoing model summarizes its thread → handoff message saved on the **new** model’s thread.
3. Next user message on the new model receives that summary in the system prompt (then cleared).

**Application flow:**

1. On workspace open → `loadChatHistory` loads all messages; UI filters by `selectedModelId`.
2. On send → user + assistant rows include `model`.
3. Dashboard badge → `fetchSessionsWithChatFlags`.

**Supabase checklist:**

- [ ] Confirm RLS policies allow `insert`/`select` on `chat_messages` and `chat_attachments` for `auth.uid() = session owner`
- [ ] Add foreign key `ON DELETE CASCADE` from messages → sessions (if not already)
- [ ] Optional index: `(session_id, timestamp)` on `chat_messages`

---

## Priority order (next sprints)

1. Master PDF content extraction fix  
2. RLS verification for chat tables  
3. Brainstorm button uses selected LLM (not Gemini-only)  
4. Single workspace data loader (remove duplicate fetch)  
5. Stronger API key encryption (user passphrase)
