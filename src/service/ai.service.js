// src/service/ai.service.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");

// ================= MULTI-KEY POOLS =================
const GEMINI_KEYS = (process.env.GEMINI_API_KEYS || "").split(",").filter(Boolean);
const CLAUDE_KEYS = (process.env.ANTHROPIC_API_KEYS || "").split(",").filter(Boolean);
const OPENAI_KEYS = (process.env.OPENAI_API_KEYS || "").split(",").filter(Boolean);


let geminiIndex = 0;
let claudeIndex = 0;
let openaiIndex = 0;

// ================= CLIENT FACTORIES =================

function createGeminiClient() {
  return new GoogleGenerativeAI(GEMINI_KEYS[geminiIndex]);
}

function createClaudeClient() {
  return new Anthropic({ apiKey: CLAUDE_KEYS[claudeIndex] });
}

function createOpenAIClient() {
  return new OpenAI({ apiKey: OPENAI_KEYS[openaiIndex] });
}
let genAI = createGeminiClient();
let anthropic = createClaudeClient();
let openai = createOpenAIClient();

// ================= KEY ROTATION =================

function rotateGeminiKey() {
  geminiIndex++;
  if (geminiIndex >= GEMINI_KEYS.length) return false;
  genAI = createGeminiClient();
  console.log("🔁 Switched Gemini API key:", geminiIndex + 1);
  return true;
}

function rotateClaudeKey() {
  claudeIndex++;
  if (claudeIndex >= CLAUDE_KEYS.length) return false;
  anthropic = createClaudeClient();
  console.log("🔁 Switched Claude API key:", claudeIndex + 1);
  return true;
}

function rotateOpenAIKey() {
  openaiIndex++;
  if (openaiIndex >= OPENAI_KEYS.length) return false;
  openai = createOpenAIClient();
  console.log("🔁 Switched OpenAI API key:", openaiIndex + 1);
  return true;
}

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
  modelKey = "gemini-25-flash",
  retried = false
) {
  try {
    conversationHistory = limitConversationHistory(conversationHistory, 10);
    const dynamicTokens = smartMaxTokens(prompt);
    const modelConfig = GEMINI_MODELS[modelKey];

    const model = genAI.getGenerativeModel({
      model: modelConfig.model,
      systemInstruction:
        "Provide complete, accurate answers. For code always return full working code.",
    });

    const chat = model.startChat({
      history: conversationHistory,
      generationConfig: {
        maxOutputTokens: Math.min(
          dynamicTokens,
          modelConfig.maxOutputTokens
        ),
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

    conversationHistory.push({ role: "user", parts: [{ text: prompt }] });
    conversationHistory.push({ role: "model", parts: [{ text }] });

    return text;
  } catch (err) {
    const isRateLimit =
      err?.status === 429 || err?.message?.includes("429");

    if (isRateLimit && !retried) {
      const switched = rotateGeminiKey();
      if (switched) {
        return generateResponseGemini(
          prompt,
          images,
          conversationHistory,
          modelKey,
          true
        );
      }
      return "⚠️ All Gemini API keys have reached their rate limit. Please try again later.";
    }

    throw err;
  }
}

// ================= CLAUDE =================

async function generateResponseClaude(
  prompt,
  images = [],
  conversationHistory = [],
  retried = false
) {
  try {
    conversationHistory = limitConversationHistory(conversationHistory, 10);
    const dynamicTokens = smartMaxTokens(prompt);

    const messages = conversationHistory.map((m) => ({
      role: m.role === "model" ? "assistant" : m.role,
      content: m.parts[0].text,
    }));

    messages.push({
      role: "user",
      content: [{ type: "text", text: prompt }],
    });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: dynamicTokens,
      temperature: 0.3,
      messages,
    });

    return response.content[0].text;
  } catch (err) {
    const isRateLimit =
      err?.status === 429 || err?.message?.includes("429");

    if (isRateLimit && !retried) {
      const switched = rotateClaudeKey();
      if (switched) {
        return generateResponseClaude(
          prompt,
          images,
          conversationHistory,
          true
        );
      }
      return "⚠️ All Claude API keys have reached their rate limit. Please try again later.";
    }

    throw err;
  }
}

// ================= CHATGPT =================

async function generateResponseChatGPT(
  prompt,
  images = [],
  conversationHistory = [],
  retried = false
) {
  try {
    conversationHistory = limitConversationHistory(conversationHistory, 10);
    const dynamicTokens = smartMaxTokens(prompt);

    const messages = conversationHistory.map((m) => ({
      role: m.role === "model" ? "assistant" : m.role,
      content: m.parts[0].text,
    }));

    messages.push({ role: "user", content: prompt });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: dynamicTokens,
      temperature: 0.3,
    });

    return response.choices[0].message.content;
  } catch (err) {
    const isRateLimit =
      err?.status === 429 || err?.message?.includes("429");

    if (isRateLimit && !retried) {
      const switched = rotateOpenAIKey();
      if (switched) {
        return generateResponseChatGPT(
          prompt,
          images,
          conversationHistory,
          true
        );
      }
      return "⚠️ All OpenAI API keys have reached their rate limit. Please try again later.";
    }

    throw err;
  }
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
