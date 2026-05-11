# Landing page visuals below

<img width="1896" height="892" alt="Screenshot 2026-03-12 174802" src="https://github.com/user-attachments/assets/53bb686c-ddb6-4d87-bbb5-b835001ceb4b" />
<img width="1912" height="889" alt="Screenshot 2026-03-12 174737" src="https://github.com/user-attachments/assets/4c9439d4-8a81-4b14-bf44-11ee222d5dff" />
<img width="1899" height="458" alt="Screenshot 2026-03-12 174854" src="https://github.com/user-attachments/assets/ffbaabdc-99d0-4f7b-b928-776f752e36bb" />
<img width="1896" height="559" alt="Screenshot 2026-03-12 174844" src="https://github.com/user-attachments/assets/19db1b61-17bb-4fbe-a538-9023d561b0a8" />
<img width="1898" height="600" alt="Screenshot 2026-03-12 174820" src="https://github.com/user-attachments/assets/f187894e-3a2b-47ab-bdea-26d3263cd429" />
<img width="1895" height="555" alt="Screenshot 2026-03-12 174813" src="https://github.com/user-attachments/assets/ccfb3e14-7aba-4ebb-aad9-cd61e7bdb620" />

# application visuals
<img width="1918" height="890" alt="Screenshot 2026-05-01 222905" src="https://github.com/user-attachments/assets/28eec7cd-f6d6-45ae-a066-bc0fe80aa937" />
<img width="1912" height="897" alt="Screenshot 2026-05-01 222832" src="https://github.com/user-attachments/assets/7aa054f4-ef8e-4bb9-976e-6d1ee738c06f" />
<!-- <img width="1909" height="886" alt="Screenshot 2026-05-01 222558" src="https://github.com/user-attachments/assets/8d8e3851-4d0e-4806-b13c-f5d675058a19" /> -->
<img width="1915" height="683" alt="Screenshot 2026-05-01 222436" src="https://github.com/user-attachments/assets/fc85009f-79ed-4592-a15a-eb90acfc0343" />
<img width="1885" height="881" alt="Screenshot 2026-05-01 222405 - Copy" src="https://github.com/user-attachments/assets/9d9395b1-ff9c-4789-9260-9426dda6b881" />
<img width="1912" height="886" alt="Screenshot 2026-05-01 222549" src="https://github.com/user-attachments/assets/52f34357-7da4-46ce-a558-d747f4c23ab3" />
<img width="1909" height="886" alt="Screenshot 2026-05-01 222558 - Copy" src="https://github.com/user-attachments/assets/e362a8ff-cba8-405c-87a8-254ffd46c589" />


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
