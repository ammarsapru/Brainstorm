import { GoogleGenAI, Type } from "@google/genai";
import { IdeaCard, Connection, FileSystemItem, ChatMessage, APIKeys } from "../types";
import { uploadFileToS3, callAIProxy } from '../lib/supabase';
import { embeddingService } from './embeddingService';
import { getProviderForModel } from '../utils/llmModels';
import debugLog from '../utils/debugLog';
import { showToast } from '../utils/toast';

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

    if (modelId.startsWith('gemini')) {
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
};

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
You can manipulate the canvas by outputting ONE valid JSON object (no Markdown fences, no backticks) placed at the very end of your message after any text.

Actions schema:
{"actions":[
  {"type":"search_cards","query":"keyword"},
  {"type":"read_card","id":"card-id"},
  {"type":"create_cards","cards":[{"text":"Title","content":"2-3 sentences of real substance","color":"#ffffff"}]},
  {"type":"update_cards","updates":[{"id":"card-id","text":"New Title","content":"Updated content","color":"#ffeba8"}]},
  {"type":"delete_cards","ids":["card-id"]},
  {"type":"connect_cards","connections":[{"fromId":"card-id","toId":"card-id"}]}
]}

Colors: #ffffff White · #ffeba8 Yellow · #ffcaca Red · #e9f5db Green · #e0f2fe Blue · #f3e8ff Purple

When you output a JSON block: keep your text to 1-3 sentences — confirm what you did, nothing more.
Do NOT list card IDs, pre-announce the plan, or narrate every change. The user sees it happen in real time.
Use search_cards before answering questions about specific card content — it gives you the full text.`;

  const sysPrompt = `You are an expert thinking partner embedded in Brainstorm, an infinite-canvas ideation tool. You think like a strategist, systems designer, and creative director combined.

**Your job:** Surface non-obvious connections, expose hidden assumptions, and help the user build sharper, more complete thinking on their canvas.

**Core rules:**
1. Be specific to THIS canvas. Every insight must reference actual cards or connections visible on the board — never give advice that could apply to any project.
2. Scan before you respond: notice what's clustered, what's isolated, what's missing, and what contradicts something else.
3. When you talk (no actions): reframe the problem, ask the one question that unlocks the next insight, or name a gap the user hasn't seen yet.
4. When you act (canvas actions): do it decisively, confirm in 1-3 sentences, never announce first.
5. When creating cards: write real content (2-3 substantive sentences) in the \`content\` field — not just a title.
6. Use search_cards proactively when you need the full text of a card before answering.

**Act vs. talk guide:**
- "Add / brainstorm / create" → create_cards
- "Connect / how does X relate to Y" → connect_cards + brief explanation
- "Organise / colour / structure" → canvas actions + 1-2 sentence summary
- "Explain / what do you think / is this right" → text response only, no actions
- Ambiguous request → ask ONE clarifying question, then act on the answer
${capabilitiesBlock}${handoffBlock}

Board context (use card IDs exactly as shown):
${boardContext}`;

  const executeAttempt = async (currentMessage: string, depth: number = 0): Promise<string> => {
    if (depth > 3) return "I've reached my maximum thinking depth.";

    let resultText = "";

    try {
      // Try server-side proxy first — keys stored encrypted, never in browser
      let usedProxy = false;
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

      if (!usedProxy) {
      debugLog.warn('aiService', 'Proxy unavailable — falling back to direct browser API call.');
      showToast('Running in direct mode — your API key is being used locally.', 'info', 4000);
      if (getProviderForModel(modelId) === 'openai') {
        if (!apiKeys.openai) return "Please add your OpenAI API Key in Settings (⚙️).";

        const messages = [
          { role: 'system', content: sysPrompt },
          ...history.map(msg => ({
            role: msg.role === 'model' ? 'assistant' : 'user',
            content: msg.text
          })),
          { role: 'user', content: currentMessage }
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

        const messages = [
          ...history.map(msg => ({
            role: msg.role === 'model' ? 'assistant' : 'user',
            content: msg.text
          })),
          { role: 'user', content: currentMessage }
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

        const result = await chat.sendMessage({ message: currentMessage });
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
              // Execute local RAG
              const results = await embeddingService.searchSimilar(searchAction.query);
              const contextString = results.map(r => `[ID: ${r.card.id}, Text: ${r.card.text}, Content Snippet: ${(r.card.content || '').substring(0, 100)}, Color: ${r.card.color}]`).join('\\n');

              const internalSystemResponse = `(System): Search results for "${searchAction.query}":\n${contextString}\nPlease proceed with the user's original request using this new context.`;

              // Recursive RLM call
              return await executeAttempt(internalSystemResponse, depth + 1);
            }

            const readAction = parsed.actions.find((a: any) => a.type === 'read_card');
            if (readAction && readAction.id) {
              const cardData = await embeddingService.getCardById(readAction.id);
              if (cardData) {
                const internalSystemResponse = `(System): Full content for card ${readAction.id}:\nTitle: ${cardData.text}\nColor: ${cardData.color}\nContent: ${cardData.content || 'None'}\nPlease proceed with the user's original request using this new context.`;
                return await executeAttempt(internalSystemResponse, depth + 1);
              } else {
                const internalSystemResponse = `(System): Card with ID ${readAction.id} not found.`;
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