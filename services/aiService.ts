import { GoogleGenAI, Type } from "@google/genai";
import { IdeaCard, Connection, FileSystemItem, ChatMessage } from "../types";
import { APIKeys } from '../components/APIKeyModal';
import { uploadFileToS3 } from '../lib/supabase';
import { embeddingService } from './embeddingService';

const defaultKey = import.meta.env.VITE_GOOGLE_API_KEY || 'MISSING_KEY';
const ai = new GoogleGenAI({ apiKey: defaultKey });

export const generateRelatedIdeas = async (contextText: string, existingIdeas: string[]): Promise<string[]> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `
        You are a brainstorming assistant.
        The user has an idea: "${contextText}".
        Current related ideas are: ${existingIdeas.join(', ')}.
        Generate 3 to 5 new, distinct, short, and creative related concepts or sub-ideas.
        Keep them concise (under 5 words each).
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING
          }
        }
      }
    });

    const jsonText = response.text || "[]";
    const ideas = JSON.parse(jsonText);

    if (Array.isArray(ideas)) {
      return ideas;
    }
    return [];
  } catch (error) {
    console.error("Failed to generate ideas:", error);
    return [];
  }
};

export const getChatResponse = async (
  history: ChatMessage[],
  newMessage: string,
  boardContext: string,
  apiKeys: APIKeys,
  modelId: string
): Promise<string> => {
  const sysPrompt = `You are a sophisticated Creative Strategist and Visual Thinker integrated into "Brainstorm", an infinite canvas tool.
                
Your Goal: Help the user expand their thinking, structurally organize ideas, and find connections they missed.

Adhere to these Guidelines:
1. Avoid "fluff" or generic greetings. Be energetic, concise, and professional.
2. Context: Use the provided board context (cards and connections) to anchor your answers in reality.

**CAPABILITIES (FUNCTION CALLING)**:
You have the ability to manipulate the canvas. You must output exactly ONE valid JSON object when you want to take an action. 
Do NOT wrap the JSON in Markdown formatting characters if it is the ONLY thing you are outputting.
You can output normal text to talk to the user, and if you want to execute an action, place the JSON object at the end of your message.

Valid Actions Schema (Always include an outer \`actions\` array):
{
  "actions": [
    {
      "type": "search_cards",  // Use this to find cards if you don't know their exact IDs
      "query": "marketing"
    },
    {
      "type": "read_card",     // Use this to read the full rich text content of a specific card
      "id": "card-123"
    },
    {
      "type": "create_cards",
      "cards": [ {"text": "Card Title", "content": "Full detailed rich text", "color": "#ffffff"} ]
    },
    {
      "type": "update_cards",
      "updates": [ {"id": "card-123", "text": "New Title", "content": "Updated rich text", "color": "#ffffff"} ] // Overwrites the card fields
    },
    {
      "type": "delete_cards",
      "ids": ["card-123", "card-456"]
    },
    {
      "type": "connect_cards",
      "connections": [ {"fromId": "card-123", "toId": "card-456"} ]
    }
  ]
}

If you do not need to take any action, you can omit the JSON completely.
Colors available: #ffffff (White), #ffeba8 (Yellow), #ffcaca (Red), #e9f5db (Green), #e0f2fe (Blue), #f3e8ff (Purple).

Current Board Context:
${boardContext}`;

  const executeAttempt = async (currentMessage: string, depth: number = 0): Promise<string> => {
    if (depth > 3) return "I've reached my maximum thinking depth.";
    
    let resultText = "";
    
    try {
      if (modelId === 'gpt-4o') {
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
            model: 'gpt-4o',
            messages
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        resultText = data.choices?.[0]?.message?.content || "No response.";
      } 
      else if (modelId === 'claude-3-5-sonnet') {
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
            'anthropic-dangerous-direct-browser-access': 'true' // Crucial to bypass CORS on Anthropic
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            system: sysPrompt,
            messages,
            max_tokens: 1024
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        resultText = data.content?.[0]?.text || "No response.";
      }
      else {
        // Gemini fallback
        const userKey = apiKeys.gemini && apiKeys.gemini.trim() ? apiKeys.gemini.trim() : null;
        const envKey = import.meta.env.VITE_GOOGLE_API_KEY;
        const targetApiKey = userKey || envKey;

        if (!targetApiKey) {
          return "Please add your Google Gemini API Key in Settings (⚙️).";
        }
        
        const activeAi = new GoogleGenAI({ apiKey: targetApiKey });

        const chatHistory = history.map(msg => ({
          role: msg.role,
          parts: [{ text: msg.text }]
        }));

        const TargetModel = 'gemini-2.5-flash';

        const chat = activeAi.chats.create({
          model: TargetModel,
          history: chatHistory,
          config: { systemInstruction: sysPrompt }
        });

        const result = await chat.sendMessage({ message: currentMessage });
        resultText = result.text || "I didn't catch that.";
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
      } catch(e) {
          // If JSON parse fails or no actions found, we just return the result to the UI
          console.warn("No RLM JSON intercepted, passing text to UI");
      }
      
      return resultText;

    } catch (error: any) {
      console.error("Chat attempt failed", error);
      let errorMsg = error.message || 'Unknown error. Check the console.';
      if (errorMsg.includes("API key not valid")) return "Your API key is not valid.";
      return `Sorry, I encountered an error: ${errorMsg}`;
    }
  };

  return await executeAttempt(newMessage, 0);
}

export const generateSessionIcon = async (sessionName: string, cardTexts: string[]): Promise<string> => {
  try {
    const prompt = `A colorful, unique 3D render icon representing the concept of "${sessionName}". 
    Context keywords: ${cardTexts.slice(0, 3).join(', ')}. 
    Style: Cute 3D isometric icon, vibrant colors, claymorphism or glossy 3d, white background, high quality. 
    Ensure the object is centered and looks like an app icon.`;

    const response = await ai.models.generateContent({
      model: 'imagen-3.0-generate-001',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
        }
      }
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const dataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        try {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          (blob as any).name = `ai-icon-${Date.now()}.${(part.inlineData.mimeType.split('/')[1] || 'png')}`;
          const s3Url = await uploadFileToS3(blob);
          if (s3Url) return s3Url;
        } catch (e) {
          console.error("Failed to upload AI icon to S3:", e);
        }
        return dataUrl;
      }
    }
    return "💡";
  } catch (error) {
    console.error("Failed to generate icon:", error);
    return "💡";
  }
}

export const generateSessionImage = async (sessionName: string, cardTexts: string[]): Promise<string | null> => {
  try {
    const prompt = `An abstract, artistic, and colorful cover image representing the concept of "${sessionName}". 
    Key themes: ${cardTexts.slice(0, 5).join(', ')}. 
    High quality, modern digital art style, 4k resolution, minimalistic but vibrant, suitable for a card background.`;

    const response = await ai.models.generateContent({
      model: 'imagen-3.0-generate-001',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
        }
      }
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const dataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        try {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          (blob as any).name = `ai-session-img-${Date.now()}.${(part.inlineData.mimeType.split('/')[1] || 'png')}`;
          const s3Url = await uploadFileToS3(blob);
          if (s3Url) return s3Url;
        } catch (e) {
          console.error("Failed to upload AI session image to S3:", e);
        }
        return dataUrl;
      }
    }
    return null;
  } catch (error) {
    console.error("Failed to generate image:", error);
    return null;
  }
}