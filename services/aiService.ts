import { GoogleGenAI, Type } from "@google/genai";
import { IdeaCard, Connection, FileSystemItem, ChatMessage } from "../types";
import { APIKeys } from '../components/APIKeyModal';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateRelatedIdeas = async (contextText: string, existingIdeas: string[]): Promise<string[]> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
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
1. **Formatting**: Provide your response in PLAIN TEXT ONLY. Do NOT use Markdown formatting characters (like #, *, **, or - for bullets). Use standard numbering (1., 2.) for lists if needed, or simple hyphens with spaces. Do NOT use bold or italics.
2. **Tone**: Energetic, concise, and professional. Avoid "fluff" or generic greetings.
3. **Context**: Use the provided board context (cards and connections) to anchor your answers in reality.
4. **Action-Oriented**: Suggest concrete next steps or new cards they could add.

**CAPABILITIES (FUNCTION CALLING)**:
- You have the ability to CREATE CARDS on the board.
- If the user asks you to create cards, add ideas, or visual elements, you MUST return the card data in a specific strict format embedded in your response.
- Use the tag [CREATE_CARDS] followed by a minified JSON array of card objects, and close with [/CREATE_CARDS].
- Structure: [CREATE_CARDS] [{"text": "Idea 1", "color": "#ffffff"}, {"text": "Idea 2", "color": "#ffeba8"}] [/CREATE_CARDS]
- You can mix this with normal text. For example: "Sure, I've added those cards for you. [CREATE_CARDS] ... [/CREATE_CARDS]"
- Allowed colors: #ffffff (White), #ffeba8 (Yellow), #ffcaca (Red), #e9f5db (Green), #e0f2fe (Blue), #f3e8ff (Purple). Default to #ffffff.

Current Board Context:
${boardContext}`;

  try {
    if (modelId === 'gpt-4o') {
      if (!apiKeys.openai) return "Please add your OpenAI API Key in Settings (⚙️).";
      
      const messages = [
        { role: 'system', content: sysPrompt },
        ...history.map(msg => ({
          role: msg.role === 'model' ? 'assistant' : 'user',
          content: msg.text
        })),
        { role: 'user', content: newMessage }
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
      return data.choices?.[0]?.message?.content || "No response.";
    } 
    else if (modelId === 'claude-3-5-sonnet') {
      if (!apiKeys.anthropic) return "Please add your Anthropic API Key in Settings (⚙️).";

      const messages = [
        ...history.map(msg => ({
          role: msg.role === 'model' ? 'assistant' : 'user',
          content: msg.text
        })),
        { role: 'user', content: newMessage }
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
      return data.content?.[0]?.text || "No response.";
    }
    else {
      // Gemini fallback
      let activeAi = ai;
      if (apiKeys.gemini) {
        activeAi = new GoogleGenAI({ apiKey: apiKeys.gemini });
      }

      const chatHistory = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
      }));

      // Map UI models to actual Google SDK models
      const mapping: Record<string, string> = {
        'gemini-3-flash': 'gemini-2.0-flash',
        'gemini-3-pro': 'gemini-2.0-pro-exp'
      };
      const actualModel = mapping[modelId] || 'gemini-2.0-flash';

      const chat = activeAi.chats.create({
        model: actualModel,
        history: chatHistory,
        config: { systemInstruction: sysPrompt }
      });

      const result = await chat.sendMessage({ message: newMessage });
      return result.text || "I didn't catch that.";
    }
  } catch (error: any) {
    console.error("Chat failed", error);
    return `Sorry, I encountered an error: ${error.message || 'Unknown error. Check the console.'}`;
  }
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
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
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
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Failed to generate image:", error);
    return null;
  }
}