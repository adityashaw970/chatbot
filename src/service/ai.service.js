// src/service/ai.service.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");

// ================= MULTI-KEY POOLS =================
const GEMINI_KEYS = (process.env.GEMINI_API_KEYS || "").split(",").filter(Boolean);
const CLAUDE_KEYS = (process.env.ANTHROPIC_API_KEYS || "").split(",").filter(Boolean);
const OPENAI_KEYS = (process.env.OPENAI_API_KEYS || "").split(",").filter(Boolean);

// ================= PRE-INITIALIZE ALL CLIENTS =================
// Create all clients upfront to avoid race conditions
const geminiClients = GEMINI_KEYS.map(key => new GoogleGenerativeAI(key));
const claudeClients = CLAUDE_KEYS.map(key => new Anthropic({ apiKey: key }));
const openaiClients = OPENAI_KEYS.map(key => new OpenAI({ apiKey: key }));

// ================= MODELS =================

const GEMINI_MODELS = {
  "gemini-3-flash-preview": {
    model: "gemini-3-flash-preview",
    maxOutputTokens: 4096,
    temperature: 0.3,
  },
  "gemini-25-flash": {
    model: "gemini-2.5-flash",
    maxOutputTokens: 2048,
    temperature: 0.3,
  },
  "gemini-25-flash-lite": {
    model: "gemini-2.5-flash-lite",
    maxOutputTokens: 2048,
    temperature: 0.3,
  },
};

// ================= UTILITIES =================

function limitConversationHistory(history, maxMessages = 10) {
  if (!Array.isArray(history)) return [];
  return history.slice(-maxMessages);
}

function smartMaxTokens(prompt = "") {
  if (/code|program|function|class|implement|example/i.test(prompt)) return 4096;
  if (/explain|how|why|guide|step/i.test(prompt)) return 2048;
  if (prompt.length < 80) return 512;
  return 1024;
}

// ================= GEMINI =================

async function generateResponseGemini(
  prompt,
  images = [],
  conversationHistory = [],
  modelKey = "gemini-25-flash"
) {
  if (geminiClients.length === 0) {
    throw new Error("No Gemini API keys configured");
  }

  const modelConfig = GEMINI_MODELS[modelKey];
  if (!modelConfig) {
    throw new Error(`Unknown Gemini model: ${modelKey}`);
  }

  // Create a COPY to avoid mutating the original
  const history = limitConversationHistory([...conversationHistory], 10);
  const dynamicTokens = smartMaxTokens(prompt);

  // Try each key in sequence until one works
  for (let keyIndex = 0; keyIndex < geminiClients.length; keyIndex++) {
    try {
      const genAI = geminiClients[keyIndex];
      
      const model = genAI.getGenerativeModel({
        model: modelConfig.model,
        systemInstruction:
          "Provide complete, accurate answers. For code always return full working code.",
      });

      const chat = model.startChat({
        history,
        generationConfig: {
          maxOutputTokens: Math.min(dynamicTokens, modelConfig.maxOutputTokens),
          temperature: modelConfig.temperature,
          topP: 0.7,
        },
      });

      const parts = [{ text: prompt }];

      for (const img of images || []) {
        const base64 = img.data.replace(/^data:image\/\w+;base64,/, "");
        parts.push({
          inlineData: {
            mimeType: img.mimeType || "image/png",
            data: base64,
          },
        });
      }

      const result = await chat.sendMessage(parts);
      const text =
        result.response?.candidates?.[0]?.content?.parts
          ?.map((p) => p.text)
          ?.join("") || "";

      // Only log success if we had to try multiple keys
      if (keyIndex > 0) {
        console.log(`✅ Successfully used Gemini key #${keyIndex + 1} after ${keyIndex} failed attempts`);
      }

      return text;

    } catch (err) {
      const isRateLimit = err?.status === 429 || err?.message?.includes("429");

      if (isRateLimit) {
        console.log(`❌ Gemini key #${keyIndex + 1}/${geminiClients.length} rate limited`);
        
        // If this is the last key, return error message
        if (keyIndex === geminiClients.length - 1) {
          return "⚠️ All Gemini API keys have reached their rate limit. Please try again later.";
        }
        
        // Otherwise, continue to next key (loop continues)
        continue;
      }

      // For non-rate-limit errors, throw immediately (don't try other keys)
      console.error(`Gemini API error (key #${keyIndex + 1}):`, err.message);
      throw err;
    }
  }

  // This should never be reached, but just in case
  return "⚠️ All Gemini API keys have been exhausted.";
}

// ================= CLAUDE =================

async function generateResponseClaude(
  prompt,
  images = [],
  conversationHistory = []
) {
  if (claudeClients.length === 0) {
    throw new Error("No Claude API keys configured");
  }

  const history = limitConversationHistory([...conversationHistory], 10);
  const dynamicTokens = smartMaxTokens(prompt);

  for (let keyIndex = 0; keyIndex < claudeClients.length; keyIndex++) {
    try {
      const anthropic = claudeClients[keyIndex];

      const messages = history.map((m) => ({
        role: m.role === "model" ? "assistant" : m.role,
        content: m.parts[0].text,
      }));

      // Build content array with text and images
      const content = [{ type: "text", text: prompt }];
      
      // Add images if provided (Claude supports vision)
      for (const img of images || []) {
        const base64 = img.data.replace(/^data:image\/\w+;base64,/, "");
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: img.mimeType || "image/png",
            data: base64,
          },
        });
      }

      messages.push({ role: "user", content });

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: dynamicTokens,
        temperature: 0.3,
        messages,
      });

      if (keyIndex > 0) {
        console.log(`✅ Successfully used Claude key #${keyIndex + 1} after ${keyIndex} failed attempts`);
      }

      return response.content[0].text;

    } catch (err) {
      const isRateLimit = err?.status === 429 || err?.message?.includes("429");

      if (isRateLimit) {
        console.log(`❌ Claude key #${keyIndex + 1}/${claudeClients.length} rate limited`);
        
        if (keyIndex === claudeClients.length - 1) {
          return "⚠️ All Claude API keys have reached their rate limit. Please try again later.";
        }
        
        continue;
      }

      console.error(`Claude API error (key #${keyIndex + 1}):`, err.message);
      throw err;
    }
  }

  return "⚠️ All Claude API keys have been exhausted.";
}

// ================= CHATGPT =================

async function generateResponseChatGPT(
  prompt,
  images = [],
  conversationHistory = []
) {
  if (openaiClients.length === 0) {
    throw new Error("No OpenAI API keys configured");
  }

  const history = limitConversationHistory([...conversationHistory], 10);
  const dynamicTokens = smartMaxTokens(prompt);

  for (let keyIndex = 0; keyIndex < openaiClients.length; keyIndex++) {
    try {
      const openai = openaiClients[keyIndex];

      const messages = history.map((m) => ({
        role: m.role === "model" ? "assistant" : m.role,
        content: m.parts[0].text,
      }));

      // GPT-4o supports vision - add images if provided
      if (images && images.length > 0) {
        const content = [{ type: "text", text: prompt }];
        for (const img of images) {
          content.push({
            type: "image_url",
            image_url: { url: img.data },
          });
        }
        messages.push({ role: "user", content });
      } else {
        messages.push({ role: "user", content: prompt });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        max_tokens: dynamicTokens,
        temperature: 0.3,
      });

      if (keyIndex > 0) {
        console.log(`✅ Successfully used OpenAI key #${keyIndex + 1} after ${keyIndex} failed attempts`);
      }

      return response.choices[0].message.content;

    } catch (err) {
      const isRateLimit = err?.status === 429 || err?.message?.includes("429");

      if (isRateLimit) {
        console.log(`❌ OpenAI key #${keyIndex + 1}/${openaiClients.length} rate limited`);
        
        if (keyIndex === openaiClients.length - 1) {
          return "⚠️ All OpenAI API keys have reached their rate limit. Please try again later.";
        }
        
        continue;
      }

      console.error(`OpenAI API error (key #${keyIndex + 1}):`, err.message);
      throw err;
    }
  }

  return "⚠️ All OpenAI API keys have been exhausted.";
}

// ================= MAIN DISPATCHER =================

async function generateResponse(
  prompt,
  images = [],
  conversationHistory = [],
  provider = "gemini-25-flash"
) {
  if (provider.startsWith("gemini-")) {
    return generateResponseGemini(
      prompt,
      images,
      conversationHistory,
      provider
    );
  }

  switch (provider.toLowerCase()) {
    case "claude":
      return generateResponseClaude(prompt, images, conversationHistory);
    case "chatgpt":
      return generateResponseChatGPT(prompt, images, conversationHistory);
    default:
      return generateResponseGemini(
        prompt,
        images,
        conversationHistory,
        "gemini-25-flash"
      );
  }
}

// ================= EXPORTS =================

module.exports = generateResponse;