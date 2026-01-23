import { GoogleGenAI, Type } from "@google/genai";
import { IdeaCard, Connection, FileSystemItem, ChatMessage } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateRelatedIdeas = async (contextText: string, existingIdeas: string[]): Promise<string[]> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
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

export const generateProjectSummary = async (
  cards: IdeaCard[],
  connections: Connection[],
  fileSystem: FileSystemItem[]
): Promise<string> => {
  // 1. Flatten File System Text
  let fileContents = "";
  const traverse = (items: FileSystemItem[]) => {
    items.forEach(item => {
      if (item.type === 'file' && item.content && !item.mediaType?.startsWith('image/')) {
        // Try to parse if it's JSON blocks, else use raw
        let text = item.content;
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) text = parsed.map((b: any) => b.text).join('\n');
        } catch (e) { }
        fileContents += `File '${item.name}':\n${text}\n---\n`;
      }
      if (item.children) traverse(item.children);
    });
  };
  traverse(fileSystem);

  // 2. Format Cards
  const cardContents = cards.map(c => `Card (ID: ${c.id}): ${c.text || c.fileName || 'Image Card'}`).join('\n');

  // 3. Format Connections
  const connectionContents = connections.map(c => {
    const from = cards.find(card => card.id === c.fromId)?.text.substring(0, 20) || 'Unknown';
    const to = cards.find(card => card.id === c.toId)?.text.substring(0, 20) || 'Unknown';
    return `${from} -> [${c.relationType}] -> ${to}`;
  }).join('\n');

  const prompt = `
        You are an expert project manager and summarizer.
        I will provide you with the raw data of a brainstorming session including idea cards, connections between them, and uploaded document contents.
        
        Please generate a comprehensive, well-structured Executive Summary of this project. 
        Format the output in clean Markdown/HTML compatible text.
        
        Structure the report as follows:
        1. **Title**: A creative title based on the content.
        2. **Overview**: A high-level summary of the main topic.
        3. **Key Concepts**: Derived from the idea cards.
        4. **Relationships**: Analysis of how ideas connect (Parent/Child hierarchies).
        5. **Document Insights**: Summary of the attached file contents.
        6. **Actionable Next Steps**: Suggested next steps based on the brainstorming.

        Here is the data:
        
        --- CARDS ---
        ${cardContents}
        
        --- CONNECTIONS ---
        ${connectionContents}
        
        --- FILES/DOCUMENTS ---
        ${fileContents}
    `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', // Use a smarter model for summarization
      contents: prompt,
      config: {
        systemInstruction: "You are a helpful AI that summarizes complex brainstorming sessions into clear, readable reports.",
      }
    });
    return response.text || "Failed to generate summary.";
  } catch (error) {
    console.error("Summary generation failed", error);
    return "An error occurred while generating the summary. Please check your API key and try again.";
  }
}

export const getChatResponse = async (
  history: ChatMessage[],
  newMessage: string,
  boardContext: string
): Promise<string> => {
  try {
    // Prepare history for the SDK
    // Map 'user' -> 'user', 'model' -> 'model'
    const chatHistory = history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));

    const chat = ai.chats.create({
      model: 'gemini-3-flash-preview',
      history: chatHistory,
      config: {
        systemInstruction: `You are a sophisticated Creative Strategist and Visual Thinker integrated into "Brainstorm", an infinite canvas tool.
                
                Your Goal: Help the user expand their thinking, structurally organize ideas, and find connections they missed.
                
                Adhere to these Guidelines:
                1. **Formatting**: Use **bold** for key concepts, *italics* for emphasis, and bullet points for lists. KEEP PARAGRAPHS SHORT.
                2. **Tone**: Energetic, concise, and professional. Avoid "fluff" or generic greetings.
                3. **Context**: Use the provided board context (cards and connections) to anchor your answers in reality.
                4. **Action-Oriented**: Suggest concrete next steps or new cards they could add.
                
                Current Board Context:
                ${boardContext}`
      }
    });

    const result = await chat.sendMessage({ message: newMessage });
    return result.text || "I didn't catch that.";
  } catch (error) {
    console.error("Chat failed", error);
    return "Sorry, I encountered an error processing your message.";
  }
}

export const generateSessionIcon = async (sessionName: string, cardTexts: string[]): Promise<string> => {
  try {
    const prompt = `A colorful, unique 3D render icon representing the concept of "${sessionName}". 
    Context keywords: ${cardTexts.slice(0, 3).join(', ')}. 
    Style: Cute 3D isometric icon, vibrant colors, claymorphism or glossy 3d, white background, high quality. 
    Ensure the object is centered and looks like an app icon.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
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
      model: 'gemini-2.5-flash-image',
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