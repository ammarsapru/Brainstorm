# 🧠 Brainstorm

Brainstorm is a visual note-taking and idea-creation application. It allows users to work on multiple ideas simultaneously, providing a spatial canvas to record, visualize, and connect secondary or supporting concepts. 

When working on complex projects or assignments founded on several fundamental concepts, it can be difficult to see how different ideas relate and the significance each holds. Brainstorm solves this by allowing deep customization of cards and their connections, enabling a significant number of visual combinations unique to each user's analytical thinking process.

## 🛠️ Tech Stack & Architecture
* **Frontend & Styling:** Next.js, TypeScript, JavaScript, Tailwind CSS.
* **Backend & Auth:** Supabase (PostgreSQL).
* **Storage:** S3 Buckets for file/image storage.
* **Vectorization & RAG (Upcoming):** Implementing `pgvector` to allow users to talk to the AI about specific canvas elements or the entire session. This will utilize a temporary session cache vector—ensuring the AI only accesses relevant content to reduce hallucinations without making the pipeline unbearably slow.

## 🗂️ Application Flow & Core Features

The application is structured hierarchically: **Sessions ➔ Folders ➔ Cards**. 

### 🎨 Sessions & The Canvas
* **Customizable Sessions:** Users can create multiple sessions and personalize them by setting a session logo, background paper, and title.
* **Pannable Canvas:** Each session opens into a fully traversable canvas. 
* **Drag-and-Drop Media:** Any file or image can be dropped directly into the canvas to be loaded and viewed.
* **The Central Idea:** Every canvas starts with a singular 'central idea' card to ground the session.

### 📄 Versatile Cards
Cards are the main objects of the application and are inherently versatile:
* **Dynamic Sizing:** In minimized form, only the card's title appears. Double-clicking opens a text document that dynamically increases in size based on its content.
* **Rich Text Editing:** Supports bold, italic, underline, and bullet/numbered lists.
* **Visual Connections:** Connect multiple cards to show relationships. The connecting lines can be dashed, utilize arrowheads, and be color-coded to provide visual cues showing the exact correlation between ideas.
* **The Three-Window Structure:** When a card is in text view, a plus sign allows you to open a second card side-by-side. Combined with the AI chat, this creates a strict three-window (MAX) structure to rapidly work on, improve, and brainstorm ideas without context-switching.

### 🤖 AI Integration & Automation (Bring Your Own Key)
Currently, AI access is handled temporarily via individual API keys. Users can choose between **Claude, Gemini, and ChatGPT** (all versions supported, though currently optimized for Gemini due to the Agentic Sub-Feature).

* **AI Sub-Feature (Agentic Automation):** Beyond standard chat, the AI serves as a point of automation. Anything the user can perform manually—creating, deleting, or connecting cards—can be executed automatically by commanding the LLM in the chat.
* **The "Purple AI" Idea Generator:** When you get stuck, select a card and click the purple AI button. The LLM will autonomously generate new cards attached to yours with supporting information. This allows you to progress through a domain of knowledge extremely fast and interpret the relationships between components of a concept instantly.
* **Asset Generation:** The AI can also be used to generate fictional logos and background banners for the sessions page.

## 🚀 Getting Started

Brainstorm is available to run on your local device or via the web on GitHub Pages (once the repository is optimized). While there is a free tier for a set amount of sessions and cards, moving to local storage allows you to bypass limits using your own API keys.

**Local Setup:**
1. Clone the repository.
2. Review `.env.example` and set up your own Supabase instance, S3 bucket, and LLM API keys.
3. Run `npm install` followed by `npm run dev`.

---
*For a deeper dive into current limits and upcoming additions, visit the Features page on the Brainstorm website.*
