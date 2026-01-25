// server.js - COMPLETE CORS FIX
const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const connectDB = require("./src/config/database");
const ChatSession = require("./src/models/ChatSession");
const app = express();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

// ✅ FIXED CORS CONFIGURATION
app.use(cors({
  origin: [
    "https://chatbot-sepia-sigma.vercel.app",  // Your Vercel frontend (no trailing slash)
    "http://localhost:5173",                   // Local development
    "http://localhost:5174"                    // Alternative local port
  ],
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 600 // Cache preflight for 10 minutes
}));

// Add security headers
app.use((req, res, next) => {
  // Log incoming requests for debugging
  // console.log(`📨 ${req.method} ${req.url} from ${req.headers.origin || 'unknown'}`);
  
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // Changed from DENY
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Don't set HSTS in development
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  next();
});

app.use(express.json());

connectDB();

// ✅ ADD HEALTH CHECK ROUTE FIRST (for debugging)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    cors: 'enabled'
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'Chatbot API Server',
    endpoints: {
      health: '/health',
      sessions: '/api/sessions',
      socketio: 'socket.io connected'
    }
  });
});

// REST API Routes for Portal
app.get('/api/sessions', async (req, res) => {
  try {
    // console.log('📋 Fetching sessions...');
    const sessions = await ChatSession.find()
      .sort({ updatedAt: -1 })
      .select('socketId lastMessage createdAt updatedAt aiProvider')
      .limit(100);
    
    // console.log(`✅ Found ${sessions.length} sessions`);
    res.json(sessions);
  } catch (error) {
    console.error('❌ Error fetching sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/sessions/all', async (req, res) => {
  try {
    const result = await ChatSession.deleteMany({});
    // console.log(`🗑️  Deleted ${result.deletedCount} sessions`);
    res.json({ 
      message: 'All sessions deleted successfully',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('❌ Error deleting all sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sessions/:sessionId/messages', async (req, res) => {
  try {
    const session = await ChatSession.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session.history);
  } catch (error) {
    console.error('❌ Error fetching messages:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sessions/:sessionId/messages', async (req, res) => {
  try {
    const { message } = req.body;
    
    const session = await ChatSession.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const newMessage = {
      message,
      sender: 'portal',
      timestamp: new Date(),
      images: []
    };

    session.history.push(newMessage);
    session.lastMessage = message;
    session.updatedAt = new Date();
    
    await session.save();
    
    if (chatbotSockets.has(session.socketId)) {
      const chatbotSocket = chatbotSockets.get(session.socketId);
      chatbotSocket.emit("portal_notification", {
        message: message,
        timestamp: new Date()
      });
    }
    
    res.json(newMessage);
  } catch (error) {
    console.error('❌ Error adding message:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/sessions/:sessionId', async (req, res) => {
  try {
    await ChatSession.findByIdAndDelete(req.params.sessionId);
    res.json({ message: 'Session deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting session:', error);
    res.status(500).json({ error: error.message });
  }
});

// ADD this route AFTER your existing /api/sessions routes
app.post('/api/sessions/:sessionId/help', async (req, res) => {
  try {
    console.log('🆘 Help request received for session:', req.params.sessionId);
    
    const session = await ChatSession.findById(req.params.sessionId);
    if (!session) {
      console.log('❌ Session not found:', req.params.sessionId);
      return res.status(404).json({ error: 'Session not found' });
    }

    const helpMessage = {
      message: "🆘 Help for code",
      sender: 'user',
      timestamp: new Date(),
      images: [],
      isHelpRequest: true
    };

    session.history.push(helpMessage);
    session.lastMessage = "🆘 Help for code";
    session.updatedAt = new Date();
    
    await session.save();
    console.log('✅ Help message saved to database');
    
    // Find the chatbot socket using the session's socketId
    const chatbotSocket = chatbotSockets.get(session.socketId);
    
    // Notify all connected portals
    let portalNotified = 0;
    portalSockets.forEach(portalSocket => {
      portalSocket.emit("help_request", {
        sessionId: req.params.sessionId,
        message: "🆘 Help for code",
        timestamp: new Date(),
        chatbotSocketId: session.socketId
      });
      portalNotified++;
    });
    
    console.log(`📢 Notified ${portalNotified} portal(s)`);
    
    res.json({ 
      success: true, 
      message: helpMessage,
      portalNotified 
    });
  } catch (error) {
    console.error('❌ Error sending help request:', error);
    res.status(500).json({ error: error.message });
  }
});


app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('🎤 === HTTP TRANSCRIPTION REQUEST (Sarvam.AI) ===');
    
    if (!req.file) {
      console.error('❌ No audio file in request');
      return res.status(400).json({ 
        success: false, 
        error: 'No audio file provided' 
      });
    }

    const audioBuffer = req.file.buffer;
    const mimeType = req.file.mimetype || 'audio/webm';
    
    console.log(`📦 Received: ${audioBuffer.length} bytes (${mimeType})`);
    
    if (audioBuffer.length < 100) {
      console.error('❌ Audio too small');
      return res.status(400).json({ 
        success: false, 
        error: 'Audio file too small' 
      });
    }

    // Transcribe with Sarvam
    console.log('🔄 Starting Sarvam transcription...');
    const transcript = await transcribeWithSarvam(audioBuffer, mimeType);
    
    const duration = Date.now() - startTime;
    console.log(`✅ Transcription complete in ${duration}ms`);
    console.log(`📝 Result: "${transcript}"`);
    
    res.json({ 
      success: true, 
      transcript,
      duration
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Transcription error after ${duration}ms:`, error.message);
    console.error('Stack:', error.stack);
    
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Transcription failed'
    });
  }
});

app.get('/api/transcribe/health', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'transcription',
    timestamp: new Date().toISOString()
  });
});

const httpServer = createServer(app);

// ✅ FIXED SOCKET.IO CORS (must match above)
const io = new Server(httpServer, {
  cors: {
    origin: [
      "https://chatbot-sepia-sigma.vercel.app",
      "http://localhost:5173",
      "http://localhost:5174"
    ],
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Content-Type"]
  },
  transports: ['websocket', 'polling']
});

const generateResponse = require("./src/service/ai.service");

const chatSessions = new Map();
const chatbotSockets = new Map();
const portalSockets = new Set();
const identifiedSockets = new Set();

io.on("connection", (socket) => {
  console.log("⚡ Client connected:", socket.id);
  
  let clientType = null;
  
  socket.on("identify", async (data) => {
    if (identifiedSockets.has(socket.id)) {
      console.log("⚠️  Socket already identified:", socket.id);
      return;
    }
    
    identifiedSockets.add(socket.id);
    clientType = data.type;
    
    if (data.type === "portal") {
      portalSockets.add(socket);
      console.log("🌐 Portal connected:", socket.id);
      
      chatbotSockets.forEach((chatbotSocket) => {
        chatbotSocket.emit("portal_status", { connected: true });
      });
    } else if (data.type === "chatbot") {
      await handleChatbotConnection(socket);
      
      const portalConnected = portalSockets.size > 0;
      socket.emit("portal_status", { connected: portalConnected });
    }
  });
  
  const identifyTimeout = setTimeout(async () => {
    if (!identifiedSockets.has(socket.id)) {
      identifiedSockets.add(socket.id);
      clientType = "chatbot";
      console.log("🤖 Auto-identified as chatbot:", socket.id);
      await handleChatbotConnection(socket);
    }
  }, 2000);
  
  socket.on("send_message", async (msg) => {
    const messageText = msg.prompt || "";
    const images = msg.images || [];
    let provider = msg.provider || 'gemini-25-flash';
    
    const providerMap = {
      'Claude': 'claude',
      'ChatGPT': 'chatgpt'
    };
    provider = providerMap[provider] || provider;
    
    const session = chatSessions.get(socket.id);
    if (!session) {
      console.log("⚠️  No session found for:", socket.id);
      return;
    }

    try {
      console.log(`🤖 Processing message with ${provider}...`);
      
      // ✅ ADD USER MESSAGE TO IN-MEMORY HISTORY
      session.history.push({
        role: 'user',
        parts: [{ text: messageText }]
      });
      
      const dbSession = await ChatSession.findById(session.dbId);
      if (dbSession) {
        dbSession.history.push({
          message: messageText,
          sender: 'user',
          timestamp: new Date(),
          images: images.map(img => ({
            data: img.data || '',
            name: img.name || 'image',
            mimeType: img.mimeType || 'image/png'
          })),
          aiProvider: provider
        });
        dbSession.lastMessage = messageText || (images.length > 0 ? `Sent ${images.length} image(s)` : '');
        dbSession.aiProvider = provider;
        dbSession.updatedAt = new Date();
        await dbSession.save();
      }
      
      if (provider.startsWith('gemini-') || provider === 'claude' || provider === 'chatgpt') {
        const reply = await generateResponse(messageText, images, session.history, provider);
        
        // ✅ ADD BOT RESPONSE TO IN-MEMORY HISTORY
        session.history.push({
          role: 'model',
          parts: [{ text: reply }]
        });
        
        if (session.history.length > 10) {
          session.history = session.history.slice(-10);
        }
        
        if (dbSession) {
          dbSession.history.push({
            message: reply,
            sender: 'bot',
            timestamp: new Date(),
            images: [],
            aiProvider: provider
          });
          dbSession.lastMessage = reply;
          dbSession.updatedAt = new Date();
          await dbSession.save();
        }
        
        socket.emit("bot_reply", { reply, provider });
        
        portalSockets.forEach(portalSocket => {
          portalSocket.emit("session_updated", {
            sessionId: session.dbId,
            lastMessage: reply,
            provider: provider
          });
        });
      }
      
    } catch (e) {
      console.error("❌ Error generating AI response:", e);
      socket.emit("bot_reply", { 
        reply: `Error generating response from ${provider}. Please check your API key.`,
        error: true
      });
    }
  });

  socket.on("clear_history", async () => {
    const session = chatSessions.get(socket.id);
    if (!session) return;
    
    session.history = [];
    
    const dbSession = await ChatSession.findById(session.dbId);
    if (dbSession) {
      dbSession.history = [];
      dbSession.lastMessage = '';
      dbSession.updatedAt = new Date();
      await dbSession.save();
    }
    
    console.log("🗑️  Chat history cleared for:", socket.id);
    socket.emit("history_cleared");
  });


  socket.on("help_request", async (data) => {
    console.log("🆘 Help request via socket:", data.sessionId);
    
    try {
      const session = await ChatSession.findById(data.sessionId);
      if (!session) {
        console.log('❌ Session not found');
        return;
      }
      
      // Broadcast to all portal sockets
      portalSockets.forEach(portalSocket => {
        portalSocket.emit("help_request", {
          sessionId: data.sessionId,
          message: data.message || "🆘 Help for code",
          timestamp: data.timestamp || new Date(),
          chatbotSocketId: session.socketId
        });
      });
      
      console.log(`📢 Help request broadcast to ${portalSockets.size} portal(s)`);
    } catch (error) {
      console.error('❌ Error broadcasting help:', error);
    }
  });


  socket.on("session_initialized", (data) => {
    console.log("✅ Session initialized:", data);
    selectedSession = data.sessionId; // Store the MongoDB _id
    
    // Show notification
    showBrowserNotification(
      `Connected! Session: ${data.socketId.slice(0, 8)}... (${data.historyLength} messages)`
    );
  });

socket.on("browser_transcribe_audio", async (data) => {
  console.log('🎤 === BROWSER TRANSCRIPTION REQUEST (Sarvam.AI) ===');
  
  try {
    const { buffer, mimeType } = data;
    
    if (!buffer) {
      throw new Error("No audio buffer received");
    }

    const audioBuffer = Buffer.from(buffer);
    console.log(`🎤 Processing: ${audioBuffer.length} bytes`);
    
    // Check if Sarvam API key exists
    if (!process.env.SARVAM_API_KEY) {
      throw new Error("SARVAM_API_KEY not configured in .env file");
    }
    
    console.log('🔑 Sarvam API Key found');
    
    // Transcribe using Sarvam.AI
    const transcript = await transcribeWithSarvam(audioBuffer, mimeType);
    console.log(`✅ Transcript: "${transcript}"`);
    
    // Send result back to THIS socket only
    socket.emit("browser_transcription_result", { 
      transcript,
      success: true 
    });
    
  } catch (error) {
    console.error("❌ Browser transcription error:", error.message);
    
    // Send detailed error to client
    let userMessage = error.message;
    
    if (error.message.includes('401') || error.message.includes('403')) {
      userMessage = "Invalid Sarvam API key. Check your .env file.";
    } else if (error.message.includes('quota')) {
      userMessage = "Sarvam API quota exceeded. Check your account.";
    } else if (error.message.includes('timeout')) {
      userMessage = "Transcription timeout. Try a shorter recording.";
    }
    
    socket.emit("browser_transcription_error", userMessage);
  }
  
  console.log('🎤 === BROWSER TRANSCRIPTION COMPLETE ===');
});

  socket.on("disconnect", () => {
    clearTimeout(identifyTimeout);
    console.log("❌ Client disconnected:", socket.id);
    
    if (clientType === "portal") {
      portalSockets.delete(socket);
      console.log("🌐 Portal removed:", socket.id);
      
      const stillHasPortals = portalSockets.size > 0;
      chatbotSockets.forEach((chatbotSocket) => {
        chatbotSocket.emit("portal_status", { connected: stillHasPortals });
      });
    } else if (clientType === "chatbot") {
      chatSessions.delete(socket.id);
      chatbotSockets.delete(socket.id);
      console.log("🤖 Chatbot removed:", socket.id);
    }
    
    identifiedSockets.delete(socket.id);
  });
});


// ==================== SARVAM.AI TRANSCRIPTION FUNCTION ====================

async function transcribeWithSarvam(audioBuffer, mimeType) {
  const FormData = require('form-data');
  const axios = require('axios');
  
  try {
    console.log('🔄 Preparing Sarvam.AI API request...');
    
    // Validate API key
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
      throw new Error('SARVAM_API_KEY not set in environment variables');
    }
    
    // Validate audio buffer
    if (!audioBuffer || audioBuffer.length < 100) {
      throw new Error('Audio buffer too small or empty');
    }
    
    console.log(`📊 Audio size: ${audioBuffer.length} bytes (${(audioBuffer.length / 1024).toFixed(2)} KB)`);
    
    // Create form data
    const form = new FormData();
    
    // Determine format
    let filename = 'audio.webm';
    let contentType = mimeType || 'audio/webm';
    
    if (mimeType?.includes('wav')) {
      filename = 'audio.wav';
      contentType = 'audio/wav';
    } else if (mimeType?.includes('mp3')) {
      filename = 'audio.mp3';
      contentType = 'audio/mp3';
    } else if (mimeType?.includes('ogg')) {
      filename = 'audio.ogg';
      contentType = 'audio/ogg';
    }
    
    console.log(`📁 Format: ${filename} (${contentType})`);
    
    // Append file
    form.append('file', audioBuffer, {
      filename: filename,
      contentType: contentType
    });
    
    // Use saarika:v2.5 for same-language transcription
    form.append('model', 'saarika:v2.5');
    
    // Try auto-detection first for best accuracy
    form.append('language_code', 'unknown');
    
    // Enable timestamps for better accuracy
    form.append('with_timestamps', 'false');
    form.append('with_diarization', 'false');
    
    console.log('📤 Sending to Sarvam.AI...');
    console.log('Config:', {
      model: 'saarika:v2.5',
      language: 'auto-detect',
      size: `${audioBuffer.length} bytes`
    });
    
    // Send request
    const response = await axios.post(
      'https://api.sarvam.ai/speech-to-text',
      form,
      {
        headers: {
          ...form.getHeaders(),
          'api-subscription-key': apiKey
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 45000 // Increased timeout for longer audio
      }
    );
    
    console.log('✅ Sarvam response received');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    // Extract transcript
    let transcript = '';
    
    if (response.data && typeof response.data.transcript !== 'undefined') {
      transcript = response.data.transcript.trim();
    } else {
      console.error('Unexpected response:', response.data);
      throw new Error('Invalid response from Sarvam.AI');
    }
    
    const detectedLang = response.data.language_code || 'unknown';
    console.log(`📝 Transcript: "${transcript}"`);
    console.log(`🌐 Language: ${detectedLang}`);
    
    // If empty transcript and detected language, might be audio issue
    if (!transcript && detectedLang) {
      console.warn('⚠️ Empty transcript but language detected - possible audio quality issue');
    }
    
    // Filter invalid
    if (!transcript || 
        transcript.length < 2 || 
        transcript.toLowerCase() === 'you' ||
        transcript === '...' ||
        transcript === '.' ||
        /^[\s\.]+$/.test(transcript)) {
      console.log('⚠️ No valid speech detected');
      return '<nospeech>';
    }
    
    return transcript;
    
  } catch (error) {
    console.error('❌ Sarvam.AI API error:', error.message);
    
    // Detailed error logging
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      console.error('Response headers:', error.response.headers);
      
      // Handle specific error codes
      if (error.response.status === 401 || error.response.status === 403) {
        throw new Error('Sarvam.AI authentication failed. Check your API key.');
      } else if (error.response.status === 429) {
        throw new Error('Sarvam.AI rate limit exceeded. Try again later.');
      } else if (error.response.status === 413) {
        throw new Error('Audio file too large. Try a shorter recording.');
      } else {
        throw new Error(`Sarvam.AI API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Transcription timeout. Try a shorter recording.');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      throw new Error('Cannot connect to Sarvam.AI API. Check your internet connection.');
    } else {
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }
}


async function handleChatbotConnection(socket) {
  if (chatSessions.has(socket.id)) {
    console.log("⚠️  Chatbot session already exists for:", socket.id);
    return;
  }
  
  // Try to find existing session by socketId
  let dbSession = await ChatSession.findOne({ socketId: socket.id });
  
  if (!dbSession) {
    // Create new session
    dbSession = new ChatSession({
      socketId: socket.id,
      history: [],
      aiProvider: 'gemini-25-flash'
    });
    await dbSession.save();
    console.log("✅ New chatbot session created:", socket.id, "| DB ID:", dbSession._id);
  } else {
    console.log("✅ Existing chatbot session restored:", socket.id, "| DB ID:", dbSession._id);
  }
  
  // Store session with DB ID
  chatSessions.set(socket.id, {
    history: dbSession.history.map(msg => ({
      role: msg.sender === 'bot' ? 'assistant' : 'user',
      content: msg.message
    })),
    dbId: dbSession._id  // This is the MongoDB ObjectId
  });
  
  chatbotSockets.set(socket.id, socket);
  
  // Send the session ID back to the chatbot
  socket.emit("session_initialized", {
    sessionId: dbSession._id.toString(),
    socketId: socket.id,
    historyLength: dbSession.history.length
  });
}

const { getKeyManagerStatus } = require("./src/service/ai.service");

app.get('/api/keys/status', (req, res) => {
  try {
    const status = getKeyManagerStatus();
    res.json({
      success: true,
      keys: status,
      totalKeys: status.length,
      activeKeys: status.filter(k => !k.isBlocked).length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT);