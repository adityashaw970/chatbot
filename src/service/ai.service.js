// // src/service/ai.service.js
// const { GoogleGenerativeAI } = require("@google/generative-ai");
// const Anthropic = require("@anthropic-ai/sdk");
// const OpenAI = require("openai");

// const ApiKeyManager = require("./apiKeyManager");

// const geminiKeyManager = new ApiKeyManager(process.env.GEMINI_API_KEYS);
// const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// // Gemini model configurations
// const GEMINI_MODELS = {
//   "gemini-3-flash-preview": {
//     model: "gemini-3-flash-preview",
//     displayName: "Gemini 2.0 Flash Preview",
//     maxTokens: 2048,
//     temperature: 0.5,
//   },
//   "gemini-25-flash": {
//     model: "gemini-2.5-flash",
//     displayName: "Gemini 2.5 Flash",
//     maxTokens: 2048,
//     temperature: 0.5,
//   },
//   "gemini-25-flash-lite": {
//     model: "gemini-2.5-flash-lite",
//     displayName: "Gemini 2.5 Flash Lite",
//     maxTokens: 1536,
//     temperature: 0.5,
//   },
// };

// const SUMMARY_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
// // let pendingSummaryJob = null;

// async function generateResponseGemini(
//   prompt,
//   images = [],
//   conversationHistory = [],
//   modelKey = "gemini-25-flash"
// ) {
//   const modelConfig =
//     GEMINI_MODELS[modelKey] || GEMINI_MODELS["gemini-25-flash"];
//   let lastError;

//   // Try all keys once
//   for (let attempt = 0; attempt < geminiKeyManager.keys.length; attempt++) {
//     const keyIndex = geminiKeyManager.getCurrentIndex();

//     try {
//       const genAI = createGeminiClient();

//       const model = genAI.getGenerativeModel({
//         model: modelConfig.model,
//         systemInstruction: "Concise, direct answers only.",
//       });

//       // Intelligent history filtering
//       const optimizedHistory = buildOptimizedHistory(conversationHistory);

//       const chat = model.startChat({
//         history: optimizedHistory,
//         generationConfig: {
//           maxOutputTokens: estimateMaxTokens(prompt),
//           temperature: modelConfig.temperature,
//           topP: 0.85,
//         },
//       });

//       const messageParts = [{ text: prompt }];

//       // Process images only if needed
//       if (images?.length && conversationHistory.length === 0) {
//         for (const img of images) {
//           const base64Data = img.data.replace(/^data:image\/\w+;base64,/, "");
//           messageParts.push({
//             inlineData: {
//               mimeType: img.mimeType || "image/png",
//               data: base64Data,
//             },
//           });
//         }
//       }

//       const result = await chat.sendMessage(messageParts);
//       const response = result.response;

//       let text =
//         response?.candidates?.[0]?.content?.parts
//           ?.map((p) => p.text)
//           ?.join("") || "";

//       // Compress response to remove redundancy
//       text = compressResponse(text);

//       geminiKeyManager.markKeyAsSuccess();

//       // Only add to history if response is meaningful
//       if (text.length > 10) {
//         conversationHistory.push({
//           role: "user",
//           parts: [{ text: truncateText(prompt, 200) }],
//         });

//         conversationHistory.push({
//           role: "model",
//           parts: [{ text }],
//         });

//         // Defer summarization to background (non-blocking)
//         if (conversationHistory.length > 18) {
//           scheduleHistoryCompaction(conversationHistory);
//         }
//       }

//       return text;
//     } catch (error) {
//       console.error("❌ Gemini key failed:", error.message);
//       lastError = error;
//       geminiKeyManager.markKeyAsFailed(keyIndex, error);
//       geminiKeyManager.rotateKey();
//     }
//   }

//   throw new Error("All Gemini API keys exhausted: " + lastError?.message);
// }

// async function generateResponseClaude(
//   prompt,
//   images = [],
//   conversationHistory = []
// ) {
//   try {
//     const optimizedHistory = buildOptimizedHistory(conversationHistory);

//     const claudeMessages = optimizedHistory.map((msg) => ({
//       role: msg.role === "model" ? "assistant" : msg.role,
//       content: [{ type: "text", text: msg.parts[0].text }]
//     }));

//     let content = [];

//     if (images.length > 0 && conversationHistory.length === 0) {
//       for (const img of images) {
//         const base64Data = img.data.replace(/^data:image\/\w+;base64,/, "");
//         const mediaType = img.mimeType || "image/png";

//         content.push({
//           type: "image",
//           source: {
//             type: "base64",
//             media_type: mediaType,
//             data: base64Data,
//           },
//         });
//       }
//     }

//     content.push({
//       type: "text",
//       text: prompt,
//     });

//     claudeMessages.push({
//       role: "user",
//       content: content,
//     });

//     const response = await anthropic.messages.create({
//       model: "claude-sonnet-4-20250514",
//       max_tokens: estimateMaxTokens(prompt),
//       messages: claudeMessages,
//     });

//     let text = response.content[0].text;
//     text = compressResponse(text);

//     if (text.length > 10) {
//       conversationHistory.push({
//         role: "user",
//         parts: [{ text: truncateText(prompt, 200) }],
//       });

//       conversationHistory.push({
//         role: "model",
//         parts: [{ text }],
//       });

//       if (conversationHistory.length > 18) {
//         scheduleHistoryCompaction(conversationHistory);
//       }
//     }

//     return text;
//   } catch (error) {
//     console.error("Error in Claude service:", error);
//     throw new Error("Failed to generate response from Claude");
//   }
// }

// async function generateResponseChatGPT(
//   prompt,
//   images = [],
//   conversationHistory = []
// ) {
//   try {
//     const optimizedHistory = buildOptimizedHistory(conversationHistory);

//     const openAIMessages = optimizedHistory.map((msg) => ({
//       role: msg.role === "model" ? "assistant" : msg.role,
//       content: [{ type: "text", text: msg.parts[0].text }],
//     }));

//     let content = [];

//    if (images.length > 0 && conversationHistory.length === 0) {
//       for (const img of images) {
//         content.push({
//           type: "image_url",
//           image_url: {
//             url: img.data,
//           },
//         });
//       }
//     }

//     content.push({
//       type: "text",
//       text: prompt,
//     });

//     openAIMessages.push({
//       role: "user",
//       content: content,
//     });

//     const response = await openai.chat.completions.create({
//       model: "gpt-4o-mini",
//       messages: openAIMessages,
//       max_tokens: estimateMaxTokens(prompt),
//     });

//     let text = response.choices[0].message.content;
//     text = compressResponse(text);

//     if (text.length > 10) {
//       conversationHistory.push({
//         role: "user",
//         parts: [{ text: truncateText(prompt, 200) }],
//       });

//       conversationHistory.push({
//         role: "model",
//         parts: [{ text }],
//       });

//       if (conversationHistory.length > 18) {
//         scheduleHistoryCompaction(conversationHistory);
//       }
//     }

//     return text;
//   } catch (error) {
//     console.error("Error in ChatGPT service:", error);
//     throw new Error("Failed to generate response from ChatGPT");
//   }
// }

// function createGeminiClient() {
//   const apiKey = geminiKeyManager.getNextAvailableKey();
//   if (!apiKey) {
//     throw new Error("No available Gemini API keys");
//   }
//   return new GoogleGenerativeAI(apiKey);
// }

// function getAvailableModels() {
//   return {
//     gemini: Object.entries(GEMINI_MODELS).map(([key, config]) => ({
//       key,
//       name: config.displayName,
//       type: "chatbot",
//     })),
//     claude: [{ key: "claude", name: "Claude Sonnet 4", type: "browser" }],
//     chatgpt: [{ key: "chatgpt", name: "ChatGPT", type: "browser" }],
//   };
// }

// function getKeyManagerStatus() {
//   return geminiKeyManager.getStatus();
// }

// function buildOptimizedHistory(history) {
//   if (!Array.isArray(history) || history.length === 0) return [];

//   const optimized = [];

//   if (
//     history._summary &&
//     Date.now() - history._summaryTimestamp < SUMMARY_CACHE_TTL
//   ) {
//     optimized.push({
//       role: "system",
//       parts: [{ text: "Context: " + history._summary }],
//     });
//   }else {
//   delete history._summary;
//   delete history._summaryTimestamp;
// }

//   optimized.push(
//   ...history.slice(-3).map((m) => ({
//     role: m.role,
//     parts: [{ text: truncateText(m.parts[0].text, 400) }],
//   }))
// );

//   return optimized;
// }


// function truncateText(text, maxLength) {
//   if (text.length <= maxLength) return text;
//   return text.substring(0, maxLength) + "...";
// }

// function compressResponse(text) {
//   if (!text) return "";

//   return text
//     .replace(/\s+/g, " ") // Remove extra whitespace
//     .replace(/\n\n+/g, "\n") // Reduce multiple newlines
//     .replace(/(\d+)\.\s+/g, "$1. ") // Normalize list formatting
//     .trim();
// }
// function scheduleHistoryCompaction(history) {
//   if (history._pendingSummaryJob) return;

//   history._pendingSummaryJob = setTimeout(async () => {
//     try {
//       await compactConversationHistory(history);
//     } catch (error) {
//       console.error("Background compaction failed:", error);
//     } finally {
//       history._pendingSummaryJob = null;
//     }
//   }, 500);
// }


// async function compactConversationHistory(history) {
//   if (!Array.isArray(history)) return;

//   if (history.length > 18) {
//     const toSummarize = history.slice(0, 15);
//     const summary = await summarizeHistoryCheap(toSummarize);

//     history._summary = summary;
//     history._summaryTimestamp = Date.now();

//     history.splice(0, 15);
//   }
// }


// async function summarizeHistoryCheap(history) {
//   try {
//     // Extract only essential info from history
//     const essentialText = history
//       .slice(-10) // Last 5 exchanges only
//       .map(
//         (m) =>
//           `${m.role === "model" ? "A" : "Q"}: ${
//             typeof m.parts[0] === "string" ? m.parts[0] : m.parts[0].text
//           }`
//       )
//       .join(" | ")
//       .substring(0, 800); // Strict limit

//     const response = await openai.chat.completions.create({
//       model: "gpt-4o-mini",
//       max_tokens: 80,
//       temperature: 0.3,
//       messages: [
//         {
//           role: "system",
//           content: "Summarize in 1-2 sentences max.",
//         },
//         { role: "user", content: essentialText },
//       ],
//     });

//     return response.choices[0].message.content;
//   } catch (error) {
//     console.error("Summarization failed:", error);
//     return "Previous conversation context.";
//   }
// }

// function estimateMaxTokens(prompt) {
//   // Ultra-conservative token estimation
//   const promptLen = prompt.length;

//   if (promptLen < 100) return 200;
//   if (promptLen < 300) return 350;
//   if (promptLen < 600) return 500;
//   return 650;
// }

// async function generateResponse(
//   prompt,
//   images = [],
//   conversationHistory = [],
//   provider = "gemini-25-flash"
// ) {
//   console.log(`Using AI provider: ${provider}`);

//   if (provider.startsWith("gemini-")) {
//     return await generateResponseGemini(
//       prompt,
//       images,
//       conversationHistory,
//       provider
//     );
//   }

//   switch (provider.toLowerCase()) {
//     case "claude":
//       return await generateResponseClaude(prompt, images, conversationHistory);
//     case "chatgpt":
//       return await generateResponseChatGPT(prompt, images, conversationHistory);
//     default:
//       return await generateResponseGemini(
//         prompt,
//         images,
//         conversationHistory,
//         "gemini-25-flash"
//       );
//   }
// }

// module.exports.getKeyManagerStatus = getKeyManagerStatus;
// module.exports = generateResponse;
// module.exports.getAvailableModels = getAvailableModels;
// module.exports.GEMINI_MODELS = GEMINI_MODELS;
// src/service/ai.service.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");

// Initialize AI clients
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Gemini model configurations
const GEMINI_MODELS = {
  'gemini-2-flash-preview': {
    model: 'gemini-3-flash-preview',
    displayName: 'Gemini 2.0 Flash Preview',
    maxTokens: 8192,
    temperature: 0.7
  },
  'gemini-25-flash': {
    model: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    maxTokens: 8192,
    temperature: 0.7
  },
  'gemini-25-flash-lite': {
    model: 'gemini-2.5-flash-lite',
    displayName: 'Gemini 2.5 Flash Lite',
    maxTokens: 4096,
    temperature: 0.7
  }
};

async function generateResponseGemini(prompt, images = [], conversationHistory = [], modelKey = 'gemini-25-flash') {
  try {
    const modelConfig = GEMINI_MODELS[modelKey] || GEMINI_MODELS['gemini-25-flash'];
    
    const model = genAI.getGenerativeModel({
      model: modelConfig.model,
      systemInstruction: "You are a helpful AI assistant. Remember the context of the conversation and provide relevant responses based on previous messages."
    });

    const chat = model.startChat({
      history: conversationHistory,
      generationConfig: {
        maxOutputTokens: modelConfig.maxTokens,
        temperature: modelConfig.temperature,
        topP: 0.9,
      },
    });

    const messageParts = [{ text: prompt }];

    if (images?.length) {
      for (const img of images) {
        const base64Data = img.data.replace(/^data:image\/\w+;base64,/, "");
        messageParts.push({
          inlineData: {
            mimeType: img.mimeType || "image/png",
            data: base64Data,
          },
        });
      }
    }

    const result = await chat.sendMessage(messageParts);
    const response = result.response;

    const text = response?.candidates?.[0]?.content?.parts?.map(p => p.text)?.join("") || "";

    conversationHistory.push({
      role: "user",
      parts: [{ text: prompt }],
    });

    conversationHistory.push({
      role: "model",
      parts: [{ text }],
    });

    return text;
  } catch (error) {
    console.error(`Error in Gemini service (${modelKey}):`, error);
    throw new Error(`Failed to generate response from Gemini ${modelKey}`);
  }
}

async function generateResponseClaude(prompt, images = [], conversationHistory = []) {
  try {
    const claudeMessages = conversationHistory.map(msg => ({
      role: msg.role === 'model' ? 'assistant' : msg.role,
      content: typeof msg.parts[0] === 'string' ? msg.parts[0] : msg.parts[0].text
    }));

    let content = [];
    
    if (images && images.length > 0) {
      for (const img of images) {
        const base64Data = img.data.replace(/^data:image\/\w+;base64,/, "");
        const mediaType = img.mimeType || "image/png";
        
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: base64Data,
          },
        });
      }
    }
    
    content.push({
      type: "text",
      text: prompt
    });

    claudeMessages.push({
      role: "user",
      content: content
    });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: claudeMessages
    });

    const text = response.content[0].text;

    conversationHistory.push({
      role: "user",
      parts: [{ text: prompt + (images.length > 0 ? " [with images]" : "") }]
    });

    conversationHistory.push({
      role: "model",
      parts: [{ text: text }]
    });

    return text;
  } catch (error) {
    console.error("Error in Claude service:", error);
    console.error("Error details:", error.message);
    if (error.status) console.error("Status:", error.status);
    throw new Error("Failed to generate response from Claude");
  }
}

async function generateResponseChatGPT(prompt, images = [], conversationHistory = []) {
  try {
    const openAIMessages = conversationHistory.map(msg => ({
      role: msg.role === 'model' ? 'assistant' : msg.role,
      content: typeof msg.parts[0] === 'string' ? msg.parts[0] : msg.parts[0].text
    }));

    let content = [];
    
    if (images && images.length > 0) {
      for (const img of images) {
        content.push({
          type: "image_url",
          image_url: {
            url: img.data
          }
        });
      }
    }
    
    content.push({
      type: "text",
      text: prompt
    });

    openAIMessages.push({
      role: "user",
      content: content
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: openAIMessages,
      max_tokens: 2048
    });

    const text = response.choices[0].message.content;

    conversationHistory.push({
      role: "user",
      parts: [{ text: prompt + (images.length > 0 ? " [with images]" : "") }]
    });

    conversationHistory.push({
      role: "model",
      parts: [{ text: text }]
    });

    return text;
  } catch (error) {
    console.error("Error in ChatGPT service:", error);
    throw new Error("Failed to generate response from ChatGPT");
  }
}

async function generateResponse(prompt, images = [], conversationHistory = [], provider = 'gemini-25-flash') {
  console.log(`Using AI provider: ${provider}`);
  
  // Check if it's a Gemini model variant
  if (provider.startsWith('gemini-')) {
    return await generateResponseGemini(prompt, images, conversationHistory, provider);
  }
  
  switch(provider.toLowerCase()) {
    case 'claude':
      return await generateResponseClaude(prompt, images, conversationHistory);
    case 'chatgpt':
      return await generateResponseChatGPT(prompt, images, conversationHistory);
    default:
      return await generateResponseGemini(prompt, images, conversationHistory, 'gemini-25-flash');
  }
}

// Export models list for frontend
function getAvailableModels() {
  return {
    gemini: Object.entries(GEMINI_MODELS).map(([key, config]) => ({
      key,
      name: config.displayName,
      type: 'chatbot'
    })),
    claude: [{ key: 'claude', name: 'Claude Sonnet 4', type: 'browser' }],
    chatgpt: [{ key: 'chatgpt', name: 'ChatGPT', type: 'browser' }]
  };
}

module.exports = generateResponse;
module.exports.getAvailableModels = getAvailableModels;
module.exports.GEMINI_MODELS = GEMINI_MODELS;