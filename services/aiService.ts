import { GoogleGenAI, Type, type Part } from "@google/genai";
import { IdeaCard, Connection, FileSystemItem, ChatMessage, ChatAttachment, APIKeys } from "../types";
import { uploadFileToS3, callAIProxy } from '../lib/supabase';
import { embeddingService } from './embeddingService';
import { getProviderForModel } from '../utils/llmModels';
import debugLog from '../utils/debugLog';
import { showToast } from '../utils/toast';
import { extractPdfText } from '../utils/pdfExtractor';
import { extractPdfTextViaLlamaParse, extractPdfTextViaGemini } from '../utils/pdfTextExtractor';

const requireNonEmptyKey = (key: string | undefined | null, providerLabel: string): string => {
  const trimmed = (key || '').trim();
  if (!trimmed) throw new Error(`Missing ${providerLabel} API key`);
  return trimmed;
};

const createGeminiClient = (apiKey: string) => new GoogleGenAI({ apiKey });

const BRAINSTORM_PROMPT = (contextText: string, existingIdeas: string[]) =>
  `You are a lateral thinking specialist. Generate 5–7 ideas related to the concept below, spanning genuinely different angles: direct applications, analogies from unrelated domains, hidden sub-problems, unexpected combinations, simplified or amplified versions, and contrarian takes. Every idea should shift thinking in a new direction — no synonyms or trivial variations. Keep each under 7 words. Return ONLY a JSON array of strings, no preamble, no markdown.
Concept: ${contextText}
Already on canvas (do not duplicate): ${existingIdeas.join(', ')}`;

export const generateRelatedIdeas = async (
  modelId: string,
  apiKeys: APIKeys,
  contextText: string,
  existingIdeas: string[]
): Promise<string[]> => {
  const parseIdeas = (text: string): string[] => {
    try {
      const match = text.match(/\[[\s\S]*\]/);
      const ideas = JSON.parse(match ? match[0] : text);
      return Array.isArray(ideas) ? ideas : [];
    } catch { return []; }
  };

  try {
    // Try server-side proxy first (keys stored server-side, never sent to browser)
    try {
      const data = await callAIProxy({ action: 'brainstorm', modelId, contextText, existingIdeas });
      const ideas = data.ideas;
      if (Array.isArray(ideas)) return ideas as string[];
    } catch (proxyErr) {
      debugLog.warn('aiService', 'Brainstorm proxy unavailable, falling back to direct call', proxyErr);
    }

    if (getProviderForModel(modelId) === 'google') {
      const activeAi = createGeminiClient(requireNonEmptyKey(apiKeys.gemini, 'Google Gemini'));
      const response = await activeAi.models.generateContent({
        model: modelId,
        contents: BRAINSTORM_PROMPT(contextText, existingIdeas),
        config: {
          responseMimeType: "application/json",
          responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
        }
      });
      return parseIdeas(response.text || "[]");
    }

    if (getProviderForModel(modelId) === 'openai') {
      const key = requireNonEmptyKey(apiKeys.openai, 'OpenAI');
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: BRAINSTORM_PROMPT(contextText, existingIdeas) }],
          response_format: { type: 'json_object' },
          max_tokens: 200,
        }),
      });
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '[]';
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : (Array.isArray(parsed.ideas) ? parsed.ideas : []);
    }

    if (getProviderForModel(modelId) === 'anthropic') {
      const key = requireNonEmptyKey(apiKeys.anthropic, 'Anthropic');
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 200,
          messages: [{ role: 'user', content: BRAINSTORM_PROMPT(contextText, existingIdeas) }],
        }),
      });
      const data = await res.json();
      return parseIdeas(data.content?.[0]?.text || '[]');
    }

    return [];
  } catch (error) {
    debugLog.error("aiService", "Failed to generate ideas:", error);
    return [];
  }
};

export type ChatRequestOptions = {
  /** Injected when user switches LLM mid-thread — plain summary, no JSON actions */
  handoffContext?: string;
  /** AbortSignal to cancel the in-flight request when user navigates away or sends a new message */
  signal?: AbortSignal;
  /** Images/files attached by the user in this message */
  attachments?: ChatAttachment[];
};

/** Fetch a public URL and return base64 data for multimodal payloads (used for Gemini). */
async function fetchBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const mimeType = blob.type || 'image/jpeg';
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve({ data: (reader.result as string).split(',')[1], mimeType });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

export const summarizeChatHandoff = async (
  priorThread: ChatMessage[],
  apiKeys: APIKeys,
  fromModelId: string,
  sessionName: string
): Promise<string> => {
  const fromLabel = fromModelId;
  const transcript = priorThread
    .filter(m => m.text?.trim() && !m.isHandoff)
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n\n');

  if (!transcript.trim()) {
    return 'The user started a new chat thread with this model. No prior messages on the previous model.';
  }

  const handoffPrompt = `You are handing this brainstorming session off to a different AI assistant.

Session name: "${sessionName}"
Your model id: ${fromLabel}

Write a concise briefing (max 350 words) for the next assistant. Include:
- What the user is trying to accomplish
- Main topics and decisions so far
- Open questions or next steps
- Any canvas/card changes discussed

Do NOT use JSON or function calls. Do NOT greet the user. Plain prose only.

Prior conversation on YOUR model thread:
${transcript}`;

  return getChatResponse([], handoffPrompt, '', apiKeys, fromModelId, {
    handoffContext: undefined,
    plainTextOnly: true,
  });
};

export const getChatResponse = async (
  history: ChatMessage[],
  newMessage: string,
  boardContext: string,
  apiKeys: APIKeys,
  modelId: string,
  options: ChatRequestOptions & { plainTextOnly?: boolean } = {}
): Promise<string> => {
  const handoffBlock = options.handoffContext
    ? `\n\n**HANDOFF FROM PREVIOUS ASSISTANT (read carefully, continue seamlessly):**\n${options.handoffContext}\n`
    : '';

  const capabilitiesBlock = options.plainTextOnly
    ? '\nRespond in plain text only. Do not output JSON or canvas actions.\n'
    : `

**CANVAS ACTIONS**:
You can manipulate the canvas by outputting ONE valid JSON object (no Markdown fences, no backticks) at the very end of your message.

IMPORTANT: That single JSON object can contain MULTIPLE action types in the same actions array. When the user asks you to create, color, AND connect cards in one message — do ALL of it inside one actions array in one response. Never split a multi-step request across multiple replies.

Action types:
{"actions":[
  {"type":"search_cards","query":"keyword"},
  {"type":"read_card","id":"card-id"},
  {"type":"create_cards","cards":[{"id":"c1","text":"Title","kind":"text","content":"body text here","color":"#ffeba8"}]},
  {"type":"update_cards","updates":[{"id":"card-id","text":"New Title","content":"Updated body","color":"#ffcaca","x":400,"y":300}]},
  {"type":"delete_cards","ids":["card-id"]},
  {"type":"connect_cards","connections":[{"fromId":"c1","toId":"c2","style":"dashed","color":"#ffcaca","relationType":"parent-child"}]},
  {"type":"update_connections","updates":[{"id":"conn-id","style":"solid","color":"#e9f5db","relationType":"equivalence"}]},
  {"type":"delete_connections","ids":["conn-id"]}
]}

**read_card** returns the full body for text cards. For PDF, document, and code file cards it extracts and returns the complete file content automatically — you don't need to explain any limitations to the user.
**search_cards** does semantic search and returns matching card summaries.

**Card kinds** — include \`kind\` in create_cards to control how the card renders:
- "text" (default) — note/document card with an editable rich-text body (\`content\` field)
- "label" — large visual section header on the canvas; purely a title, no body; great for grouping clusters
- "browser" — embeds a live website inside the card; requires \`url\` field (full https:// URL)
- "image" — displays an image; requires \`url\` field (must be a direct image URL ending in .jpg/.png/etc)
Omit kind (or use "text") for regular note cards. Infer the right kind from context.

**Flowcharts** — label cards support a \`shape\` field that turns them into flowchart nodes:
- "rectangle" (default) — a process / action step
- "diamond" — a decision / yes-no branch
- "circle" — a start or end node
- "square" — a generic node
To build a flowchart: create label cards with the right \`shape\`, keep their \`text\` short (a few words), and use connect_cards (relationType "parent-child") to link the flow. Label decision branches by writing the condition into the next card's text (e.g. a card after a diamond).

**Content fields**:
- \`text\` = the card's header/title — keep it short (one line)
- \`content\` = the card's document body text — write full paragraphs here, separated by \\n
- To APPEND to an existing card's content without replacing it: first use read_card to read the current body, then use update_cards with original body + your new content joined with \\n\\n

**Spatial rules**:
- Card positions are shown as pos:(x,y) in the canvas context. The canvas context also shows "Suggested position for new cards" — use coordinates near that suggestion for new cards so they appear in empty space.
- You may override x,y in create_cards if you want specific placement. The view will automatically pan to newly created cards.
- When asked to spread, rearrange, or organise: use update_cards with new x,y values spread across the canvas.

**Connection field values**:
- style: "solid" | "dashed" | "dotted"
- relationType: "equivalence" (arrows both ends) | "parent-child" (circle→arrow) | "child-parent" (arrow→circle)
- color: any hex color — omit field to keep default

Colors: #ffffff White · #ffeba8 Yellow · #ffcaca Red · #e9f5db Green · #e0f2fe Blue · #f3e8ff Purple

Example — creating 3 colored connected cards in ONE response:
{"actions":[
  {"type":"create_cards","cards":[
    {"id":"c1","text":"Event A","kind":"text","content":"Full explanation of Event A.","color":"#ffeba8"},
    {"id":"c2","text":"Event B","kind":"text","content":"Full explanation of Event B.","color":"#ffcaca"},
    {"id":"c3","text":"Event C","kind":"label","color":"#e9f5db"}
  ]},
  {"type":"connect_cards","connections":[
    {"fromId":"c1","toId":"c2","style":"solid","color":"#ffeba8","relationType":"parent-child"},
    {"fromId":"c2","toId":"c3","style":"dashed","relationType":"parent-child"}
  ]}
]}

Rules:
- Multi-action: put ALL action types in one actions array — never split into separate replies.
- Color goes directly on the card in create_cards — do NOT use a separate update_cards step just to add color.
- When creating multiple cards: assign a DIFFERENT color from the palette to each card.
- When creating cards you plan to connect: give each a short temporary id (e.g. "c1", "c2"), then reference those ids in connect_cards. create_cards must come BEFORE connect_cards in the array.
When you output a JSON block: ONE sentence, under 12 words total. Examples: "Done." / "Created 10 cards." / "Connected and coloured." NEVER describe what the cards contain, never list topics, never explain the changes — the user can see the canvas.
Do NOT list card IDs, pre-announce the plan, or narrate every change.
Use search_cards before answering questions about specific card content.`;

  const sysPrompt = `You are an expert thinking partner embedded in Brainstorm, an infinite-canvas ideation tool. You think like a strategist, systems designer, and creative director combined.

**Your job:** Surface non-obvious connections, expose hidden assumptions, and help the user build sharper, more complete thinking on their canvas.

**Core rules:**
1. Be specific to THIS canvas. Every insight must reference actual cards or connections visible on the board — never give advice that could apply to any project.
2. Scan before you respond: notice what's clustered, what's isolated, what's missing, and what contradicts something else.
3. When you talk (no actions): reframe the problem, ask the one question that unlocks the next insight, or name a gap the user hasn't seen yet.
4. When you act (canvas actions): do it decisively, confirm in 1-3 sentences, never announce first.
5. When creating cards: write 3-4 substantive sentences in the \`content\` field. When explicitly asked to fill out or expand a card's content: write at least 10 paragraphs of 2 sentences each — cover the topic thoroughly.
6. Use search_cards proactively when you need the full text of a card before answering.
7. **File and PDF cards**: when the user asks about the content of a PDF, document, or code file on the canvas, you MUST use \`read_card\` with that card's ID. The platform will extract and return the full text from the file automatically. NEVER say you cannot read a file — always attempt \`read_card\` first. Only after receiving the file content should you respond.

**Act vs. talk guide:**
- "Add / brainstorm / create" → create_cards
- "Connect / how does X relate to Y" → connect_cards + brief explanation
- "Organise / colour / structure" → canvas actions + 1-2 sentence summary
- "Explain / what do you think / is this right" → text response only, no actions
- Ambiguous request → ask ONE clarifying question, then act on the answer
${capabilitiesBlock}${handoffBlock}

In your chat text, always refer to cards by their title (e.g. "the 'Week 2' card"), never by their ID. Use IDs only inside JSON action objects.

Board context (use card IDs exactly as shown in JSON actions):
${boardContext}`;

  const executeAttempt = async (currentMessage: string, depth: number = 0): Promise<string> => {
    if (depth > 3) return "I've reached my maximum thinking depth.";

    let resultText = "";

    try {
      // Try server-side proxy first — keys stored encrypted, never in browser.
      // Skip proxy when attachments are present: the text-only Edge Function can't forward image data.
      let usedProxy = false;
      const hasAttachments = (options.attachments?.length ?? 0) > 0;
      if (!hasAttachments) {
        try {
          const data = await callAIProxy({
            action: 'chat',
            modelId,
            systemPrompt: sysPrompt,
            history: history.map(m => ({ role: m.role, text: m.text })),
            newMessage: currentMessage,
          }, options.signal);
          resultText = (data.text as string) ?? '';
          usedProxy = true;
        } catch (err: any) {
          if (err?.name === 'AbortError') throw err;
          // Proxy unavailable or no server-side key — fall through to direct calls
        }
      }

      if (!usedProxy) {
      debugLog.warn('aiService', 'Proxy unavailable — falling back to direct browser API call.');
      showToast('Running in direct mode — your API key is being used locally.', 'info', 4000);
      if (getProviderForModel(modelId) === 'openai') {
        if (!apiKeys.openai) return "Please add your OpenAI API Key in Settings (⚙️).";

        // Build multimodal user content if attachments present
        const userContent: unknown[] = [{ type: 'text', text: currentMessage }];
        for (const att of options.attachments ?? []) {
          if (att.type === 'image') {
            userContent.push({ type: 'image_url', image_url: { url: att.url, detail: 'auto' } });
          } else {
            userContent.push({ type: 'text', text: `[Attached file: ${att.name} — ${att.url}]` });
          }
        }

        const messages = [
          { role: 'system', content: sysPrompt },
          ...history.map(msg => ({
            role: msg.role === 'model' ? 'assistant' : 'user',
            content: msg.text
          })),
          { role: 'user', content: userContent.length > 1 ? userContent : currentMessage }
        ];

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKeys.openai}`
          },
          body: JSON.stringify({
            model: modelId,
            messages,
            temperature: 0.8,
            max_tokens: 4096,
          }),
          signal: options.signal,
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        resultText = data.choices?.[0]?.message?.content || "No response.";
      }
      else if (getProviderForModel(modelId) === 'anthropic') {
        if (!apiKeys.anthropic) return "Please add your Anthropic API Key in Settings (⚙️).";

        // Build multimodal user content parts for Anthropic
        const userParts: unknown[] = [];
        for (const att of options.attachments ?? []) {
          if (att.type === 'image') {
            if (att.url.startsWith('data:')) {
              const [header, b64data] = att.url.split(',');
              const mediaType = header.match(/data:(.*);base64/)?.[1] || 'image/jpeg';
              userParts.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: b64data } });
            } else {
              userParts.push({ type: 'image', source: { type: 'url', url: att.url } });
            }
          } else {
            userParts.push({ type: 'text', text: `[Attached file: ${att.name} — ${att.url}]` });
          }
        }
        userParts.push({ type: 'text', text: currentMessage });

        const messages = [
          ...history.map(msg => ({
            role: msg.role === 'model' ? 'assistant' : 'user',
            content: msg.text
          })),
          { role: 'user', content: userParts.length > 1 ? userParts : currentMessage }
        ];

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKeys.anthropic,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: modelId,
            system: sysPrompt,
            messages,
            max_tokens: 4096,
            temperature: 0.8,
          }),
          signal: options.signal,
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        resultText = data.content?.[0]?.text || "No response.";
      }
      else {
        // Gemini fallback
        const targetApiKey = apiKeys.gemini?.trim();
        if (!targetApiKey) return "Please add your Google Gemini API Key in Settings (⚙️).";

        const activeAi = createGeminiClient(targetApiKey);

        const chatHistory = history.map(msg => ({
          role: msg.role,
          parts: [{ text: msg.text }]
        }));

        const TargetModel = modelId && modelId.startsWith('gemini-') ? modelId : 'gemini-2.5-flash';

        const chat = activeAi.chats.create({
          model: TargetModel,
          history: chatHistory,
          config: { systemInstruction: sysPrompt }
        });

        // Build multimodal parts for Gemini — images must be inlined as base64
        const geminiParts: Part[] = [];
        for (const att of options.attachments ?? []) {
          if (att.type === 'image') {
            const b64 = att.url.startsWith('data:')
              ? { data: att.url.split(',')[1], mimeType: att.url.match(/data:(.*);base64/)?.[1] || 'image/jpeg' }
              : await fetchBase64(att.url);
            if (b64) {
              geminiParts.push({ inlineData: { data: b64.data, mimeType: b64.mimeType } });
            }
          } else {
            geminiParts.push({ text: `[Attached file: ${att.name} — ${att.url}]` });
          }
        }
        geminiParts.push({ text: currentMessage });

        const result = await chat.sendMessage({ message: geminiParts });
        resultText = result.text || "I didn't catch that.";
      }
      } // end if (!usedProxy)

      if (options.plainTextOnly) {
        return resultText;
      }

      // RLM Loop Interception Logic
      // Check if the AI returned a JSON with a "search_cards" action
      try {
        // A naive parse to see if there's a JSON block
        const jsonMatch = resultText.match(/\{[\s\S]*"actions"[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.actions && Array.isArray(parsed.actions)) {
            const searchAction = parsed.actions.find((a: any) => a.type === 'search_cards');
            if (searchAction && searchAction.query) {
              const results = await embeddingService.searchSimilar(searchAction.query);
              const parseBody = (content?: string): string => {
                if (!content) return '';
                try {
                  const blocks = JSON.parse(content);
                  if (Array.isArray(blocks)) {
                    const text = blocks
                      .map((b: any) => (b.text || '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim())
                      .filter(Boolean).join(' ');
                    return text.length > 300 ? text.slice(0, 300) + '…' : text;
                  }
                } catch { /* not JSON */ }
                return content.substring(0, 300);
              };
              const contextString = results.map(r => {
                const kindLabel = r.card.kind === 'file'
                  ? `[file/${r.card.fileSubtype || 'other'} "${r.card.fileName || ''}"]`
                  : r.card.kind ? `[${r.card.kind}]` : '[text]';
                const body = parseBody(r.card.content);
                return `ID: ${r.card.id}, ${kindLabel} Title: "${r.card.text || r.card.fileName || ''}", Body: "${body || 'empty'}"`;
              }).join('\n');

              const internalSystemResponse = `(System): Search results for "${searchAction.query}":\n${contextString}\nPlease proceed with the user's original request using this new context.`;
              return await executeAttempt(internalSystemResponse, depth + 1);
            }

            const readAction = parsed.actions.find((a: any) => a.type === 'read_card');
            if (readAction && readAction.id) {
              debugLog('aiService', 'read_card action triggered for id:', readAction.id);
              const cardData = await embeddingService.getCardById(readAction.id);
              debugLog('aiService', 'read_card card data:', cardData ? `kind=${cardData.kind} url=${cardData.url ? 'present' : 'missing'}` : 'NOT FOUND');
              if (cardData) {
                const title = cardData.text || cardData.fileName || 'Untitled';
                const kindLabel = cardData.kind
                  ? `${cardData.kind}${cardData.fileSubtype ? `/${cardData.fileSubtype}` : ''}`
                  : 'text';
                let bodyText = '';

                // Helper: parse DocBlock JSON to plain text
                const parseDocBlocks = (raw?: string): string => {
                  if (!raw) return '';
                  try {
                    const blocks = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    if (Array.isArray(blocks)) {
                      return blocks
                        .map((b: any) => (b.text || '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim())
                        .filter(Boolean)
                        .join('\n');
                    }
                    return String(raw);
                  } catch { return String(raw); }
                };

                if (cardData.kind === 'file' || cardData.kind === 'image') {
                  const url = cardData.url;
                  if (url) {
                    const isPdf = url.toLowerCase().includes('.pdf') || cardData.fileSubtype === 'pdf';
                    debugLog('aiService', 'read_card file extraction:', { url: url.slice(0, 60), isPdf });
                    if (isPdf) {
                      // Priority: LlamaParse → Gemini vision → pdfjs → stored content
                      if (!bodyText && apiKeys.llamacloud) {
                        try {
                          bodyText = await extractPdfTextViaLlamaParse(url, apiKeys.llamacloud);
                          debugLog('aiService', 'read_card LlamaParse extracted length:', bodyText.length);
                        } catch (e) { debugLog.warn('aiService', 'LlamaParse failed', e); }
                      }
                      if (!bodyText && apiKeys.gemini) {
                        try {
                          bodyText = await extractPdfTextViaGemini(url, apiKeys.gemini);
                          debugLog('aiService', 'read_card Gemini extracted length:', bodyText.length);
                        } catch (e) { debugLog.warn('aiService', 'Gemini extraction failed', e); }
                      }
                      if (!bodyText) {
                        try {
                          bodyText = await extractPdfText(url);
                          debugLog('aiService', 'read_card pdfjs extracted length:', bodyText.length);
                        } catch (e) {
                          debugLog.warn('aiService', 'pdfjs extraction failed, using stored content', e);
                          bodyText = parseDocBlocks(cardData.content);
                        }
                      }
                    } else {
                      try {
                        const res = await fetch(url, { mode: 'cors' });
                        if (res.ok) {
                          const raw = await res.text();
                          bodyText = raw.length > 60_000 ? raw.slice(0, 60_000) + '\n[truncated]' : raw;
                        } else {
                          bodyText = parseDocBlocks(cardData.content);
                        }
                      } catch {
                        bodyText = parseDocBlocks(cardData.content);
                      }
                    }
                    // Final fallback: always return stored content if extraction produced nothing
                    if (!bodyText.trim()) {
                      bodyText = parseDocBlocks(cardData.content);
                    }
                  } else {
                    // No URL — use stored content
                    bodyText = parseDocBlocks(cardData.content);
                  }
                } else if (cardData.content) {
                  // Text card — parse DocBlocks
                  bodyText = parseDocBlocks(cardData.content);
                }

                const internalSystemResponse = `(System): Full content of card titled "${title}" (${kindLabel}):\n\n${bodyText || '(no body content)'}\n\nPlease proceed with the user's original request using this information.`;
                return await executeAttempt(internalSystemResponse, depth + 1);
              } else {
                const internalSystemResponse = `(System): Card not found. Use search_cards to find the card you need.`;
                return await executeAttempt(internalSystemResponse, depth + 1);
              }
            }
          }
        }
      } catch (e) {
        // If JSON parse fails or no actions found, we just return the result to the UI
        debugLog.warn("aiService", "No RLM JSON intercepted, passing text to UI");
      }

      return resultText;

    } catch (error: any) {
      debugLog.error("aiService", "Chat attempt failed", error);
      let errorMsg = error.message || 'Unknown error. Check the console.';
      if (errorMsg.includes("API key not valid")) return "Your API key is not valid.";
      return `Sorry, I encountered an error: ${errorMsg}`;
    }
  };

  return await executeAttempt(newMessage, 0);
}

const persistGeneratedImageBytes = async (
  imageBytes: string,
  filePrefix: string
): Promise<string | null> => {
  const mime = 'image/png';
  const dataUrl = `data:${mime};base64,${imageBytes}`;
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    (blob as File & { name?: string }).name = `${filePrefix}-${Date.now()}.png`;
    const s3Url = await uploadFileToS3(blob);
    if (s3Url) return s3Url;
  } catch (e) {
    debugLog.error('aiService', 'Failed to upload generated image', e);
  }
  return dataUrl;
};

const generateImagenAsset = async (
  apiKey: string,
  prompt: string,
  aspectRatio: '1:1' | '16:9',
  filePrefix: string
): Promise<string | null> => {
  const activeAi = createGeminiClient(requireNonEmptyKey(apiKey, 'Google Gemini'));
  const response = await activeAi.models.generateImages({
    model: 'imagen-3.0-generate-002',
    prompt,
    config: {
      numberOfImages: 1,
      aspectRatio,
    },
  });

  const bytes = response.generatedImages?.[0]?.image?.imageBytes;
  if (!bytes) {
    throw new Error('Imagen returned no image. Check that your Gemini API key has image generation enabled.');
  }
  return persistGeneratedImageBytes(bytes, filePrefix);
};

export const generateSessionIcon = async (
  apiKey: string,
  sessionName: string,
  cardTexts: string[]
): Promise<string> => {
  try {
    const prompt = `A colorful, unique 3D render icon representing the concept of "${sessionName}". Context keywords: ${cardTexts.slice(0, 3).join(', ')}. Style: cute 3D isometric app icon, vibrant colors, white background, centered.`;
    const url = await generateImagenAsset(apiKey, prompt, '1:1', 'ai-icon');
    return url || '💡';
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Image generation failed';
    debugLog.error('aiService', 'Failed to generate icon', error);
    throw new Error(msg);
  }
};

export const generateSessionImage = async (
  apiKey: string,
  sessionName: string,
  cardTexts: string[]
): Promise<string | null> => {
  try {
    const prompt = `An abstract artistic cover image for "${sessionName}". Themes: ${cardTexts.slice(0, 5).join(', ')}. Modern digital art, vibrant, minimal, suitable as a card wallpaper.`;
    return await generateImagenAsset(apiKey, prompt, '16:9', 'ai-session-img');
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Image generation failed';
    debugLog.error('aiService', 'Failed to generate session image', error);
    throw new Error(msg);
  }
};