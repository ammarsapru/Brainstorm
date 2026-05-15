<!-- <p align="center">
  <img src="brainstorm_banner.svg" alt="Brainstorm — Think bigger. Connect better." width="100%"/>
</p> -->

<p align="center">
  <a href="https://ammarsapru.github.io/Brainstorm/"><img src="https://img.shields.io/badge/Web_App-Live-4ade80?style=flat-square&logoColor=white" alt="Web App"/></a>
  <img src="https://img.shields.io/badge/Desktop-Electron-818cf8?style=flat-square&logo=electron&logoColor=white" alt="Electron"/>
  <img src="https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js&logoColor=white" alt="Next.js"/>
  <img src="https://img.shields.io/badge/TypeScript-blue?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Supabase-S3_Storage-3ecf8e?style=flat-square&logo=supabase&logoColor=white" alt="Supabase"/>
  <img src="https://img.shields.io/badge/AI-BYOK_(Claude_·_Gemini_·_GPT)-f472b6?style=flat-square" alt="AI"/>
  <img src="https://img.shields.io/badge/Privacy-On--Device_RAG-22d3ee?style=flat-square" alt="Privacy"/>
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT"/>
</p>

---

## What is Brainstorm?

Most note-taking apps force your ideas into lists. Brainstorm doesn't.

**Brainstorm** is a canvas-based visual thinking and note-taking application where ideas live as interconnected cards on an infinite spatial canvas. You place them, connect them, color them, and expand any card into a full rich-text document all without ever leaving your workspace.

It reimagines the relationship between thought and structure: instead of organizing ideas after the fact, Brainstorm lets you think spatially and visually from the start, mapping out how concepts relate, cause, or build on each other in real time.

An AI assistant with full canvas awareness sits alongside your work. It can read your cards, understand your session context entirely on-device, and perform any action you can — creating cards, connecting ideas, and expanding content  all from a single natural language instruction.

---

## The Problem It Solves

When working across complex projects, assignments, or research involving several interconnected concepts, it becomes genuinely difficult to see how ideas relate and what significance each holds. Traditional note-taking forces a linear structure onto inherently non-linear thinking.

Brainstorm solves this by:
- Giving every idea its own card with spatial position on an infinite canvas
- Letting you define the *type* of relationship between any two ideas not just draw a line
- Expanding any card into a full document without losing your spatial overview
- Letting AI see exactly what you see and act on the canvas on your behalf

---

## Stack & Architecture

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 15, TypeScript, JavaScript, Tailwind CSS |
| **Backend & Auth** | Supabase (PostgreSQL, Auth) |
| **File & Image Storage** | S3 Buckets via Supabase |
| **On-Device AI/RAG** | `@xenova/transformers` (Transformers.js) — runs entirely in-browser |
| **LLM Integration** |  Gemini API (BYOK) |
| **Desktop Packaging** | Electron + electron-builder |
| **Deployment** | GitHub Pages (web) + `.exe` executable (desktop) |

> **Privacy by design:** Session vectorization runs entirely on your device using `@xenova/transformers`. Your canvas content is never sent to an external embedding API or stored in a remote vector database. The AI sees your cards in real time through a local, in-memory vector store that syncs instantly as you edit.

---

## Getting Started

Brainstorm runs in three ways — choose what fits your setup.

### Option 1  Web App (No Setup)

Visit the live deployment directly in your browser:

**[→ Launch Brainstorm](https://ammarsapru.github.io/Brainstorm/)**

Bring your own API key for  Gemini,  configure it in the AI chat settings panel inside the app.

---

### Option 2  Docker

```bash
# Clone the repository
git clone https://github.com/ammarsapru/Brainstorm.git
cd Brainstorm

# Copy environment variables
cp .env.example .env.local
# Fill in your Supabase URL, Supabase Anon Key, and S3 bucket details

# Run with Docker
docker compose up
```

Visit `http://localhost:3000`.

---

### Option 3  Local Development

```bash
# Clone the repository
git clone https://github.com/ammarsapru/Brainstorm.git
cd Brainstorm

# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Add your Supabase URL, Supabase Anon Key, and S3 bucket credentials

# Run the development server
npm run dev
```

Visit `http://localhost:3000`.

---

### Option 4  Desktop Executable (.exe)

Download the latest `.exe` from the [Releases](https://github.com/ammarsapru/Brainstorm/releases) page and run it directly  no terminal required. The desktop app runs the full Brainstorm experience locally via Electron.

To build from source:

```bash
npm run desktop:build   # builds and packages the .exe
npm run desktop:publish # builds and publishes to GitHub Releases
```

---

### Environment Variables

Create a `.env.local` from `.env.example` and fill in the following:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# S3 storage bucket credentials (configured via Supabase)
```

LLM API keys (Claude, Gemini, ChatGPT) are entered directly in the app — they are never stored server-side.

---

## Features

### 🎨 Infinite Canvas
<img width="1327" height="885" alt="image" src="https://github.com/user-attachments/assets/25becedd-5b94-459e-8ffb-2416c36ff9a5" />


> 

The canvas is your workspace. Pan freely in any direction, drag cards anywhere, and never run out of space. Every session opens into its own canvas  organized under a **Sessions → Folders → Cards** hierarchy so your work stays structured without constraining the space itself.

Each session can have a custom title, logo, and background  including AI-generated ones.

---

### 🃏 Cards

> 
<img width="1904" height="908" alt="image" src="https://github.com/user-attachments/assets/d6bbe58a-761f-4c20-9fc2-a870dc5c706f" />

Cards are the core object of Brainstorm. Every card is:

- **Placeable** :— drag anywhere on the canvas
- **Colorable** :— assign any color to visually group or distinguish ideas
- **Connectable** :— draw lines between cards to define relationships
- **Expandable** :— double-click to open as a full rich-text document

**Connection types** — lines between cards are not just visual. You can define the *semantic relationship*:

| Type | Meaning |
|---|---|
| **Equal / Continuation** | Ideas at the same level; one extends the other |
| **Parent → Child** | One idea leads to, causes, or contains the other |
| **Dashed** | Loose association or tentative relationship |

Lines can also be any color and the parent-child direction can be flipped. This turns your canvas into a true knowledge graph, not just a mood board.

---

### 📝 Card Documents (Deep Dive)

<img width="1912" height="886" alt="Screenshot 2026-05-01 222549 - Copy" src="https://github.com/user-attachments/assets/a468d799-8213-4ff7-9705-67e936b04e23" />

> 

Double-click any card to expand it into a full-featured document editor  without leaving your canvas view. Each document supports:

- Bold, italic, underline formatting
- Multiple font options and heading levels
- Numbered lists and bullet points
- **Export as PDF** or **Markdown**

The document auto-syncs back to the card on the canvas. Changes in the document are immediately reflected in your spatial view.

---

### 🤖 AI Features

>
> <img width="1884" height="930" alt="image" src="https://github.com/user-attachments/assets/e5a07786-4664-47df-9bfc-c4aaa2081693" />


Brainstorm's AI runs alongside your canvas as a contextual assistant  it sees what you see.

**On-Device Session RAG**
Using `@xenova/transformers`, your cards are vectorized locally in the browser the moment they are created or edited. The AI searches this local vector store in real time. No card content ever leaves your device for embedding. No network latency. No privacy tradeoff.

**Agentic Canvas Control**
The AI can perform any action you can from a single natural language instruction:

> *"Create cards discussing 4 great leaders from history and connect them all to a center card called '4 Great Leaders'"*

The agent creates the cards, populates the content, and draws the connections  autonomously.

**Purple AI Idea Generator**
Select any card and click the purple AI button. The AI autonomously generates new connected cards with supporting information, instantly expanding your thinking on that concept.

**Bring Your Own Key**
Connect Claude, Gemini, or ChatGPT using your own API key  configured directly in the AI chat settings panel. All versions of each provider are supported.

**AI Asset Generation**
Generate session logos and background banners using AI directly from the sessions page.

---

### 📁 Sidebar

> *Screenshot: sidebar open showing cards and files*

The sidebar gives you a structured overview of everything in your session:

- Browse all cards, folders, files, and images in one place
- **Double-click any card** in the sidebar to fly to its position on the canvas
- Manage session assets without losing your canvas position

---

### 🖼 Files & Images

> *Screenshot: image dropped onto canvas*

- **Drag-and-drop** or **copy-paste** any file or image directly onto the canvas
- Open and view files inline within the application
- Paste images directly into card document cells
- All file storage is handled via **S3 buckets through Supabase**  fast, secure, and scalable

---

## Roadmap

- [ ] Collaborative real-time canvas (multi-user sessions)
- [ ] Mobile companion app
- [ ] Plugin / extension system
- [ ] Additional export formats (PNG canvas snapshot, PPTX)
- [ ] Claude Code integration for in-canvas code execution

---

## Contributing

Contributions are welcome. Clone the repo, create a feature branch, and open a pull request.

```bash
git checkout -b feature/your-feature-name
```

---

## License

MIT — free to use, modify, and distribute.

---

<p align="center">
  Built by <a href="https://github.com/ammarsapru">Ammar Sheikh</a> &nbsp;·&nbsp;
  <a href="https://ammarsapru.github.io/Brainstorm/">Live App</a> &nbsp;·&nbsp;
  <a href="https://github.com/ammarsapru/Brainstorm/releases">Download</a>
</p>
