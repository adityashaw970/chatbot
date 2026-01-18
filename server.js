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
  console.log(`📨 ${req.method} ${req.url} from ${req.headers.origin || 'unknown'}`);
  
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
const transcribeAudio = require("./src/service/transcription.service");

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

  socket.on("transcribe_audio", async (data) => {
    // console.log("🎤 Received audio for transcription");
    
    try {
      const { buffer, mimeType } = data;
      
      if (!buffer) {
        throw new Error("No audio buffer received");
      }

      const audioBuffer = Buffer.from(buffer);
      console.log(`Processing audio: ${audioBuffer.length} bytes, type: ${mimeType}`);
      
      const transcript = await transcribeAudio(audioBuffer, mimeType);
      
      if (transcript && transcript.trim()) {
        console.log("✅ Transcription successful:", transcript.substring(0, 100) + "...");
        socket.emit("transcription_result", transcript);
      } else {
        socket.emit("transcription_error", "No speech detected in audio");
      }
      
    } catch (e) {
      console.error("❌ Transcription error:", e);
      socket.emit("transcription_error", e.message || "Failed to transcribe audio");
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

async function handleChatbotConnection(socket) {
  if (chatSessions.has(socket.id)) {
    console.log("⚠️  Chatbot session already exists for:", socket.id);
    return;
  }
  
  let dbSession = await ChatSession.findOne({ socketId: socket.id });
  
  if (!dbSession) {
    dbSession = new ChatSession({
      socketId: socket.id,
      history: [],
      aiProvider: 'gemini-25-flash'
    });
    await dbSession.save();
    console.log("New chatbot session created:", socket.id);
  } else {
    console.log(" Existing chatbot session restored:", socket.id);
  }
  
  chatSessions.set(socket.id, {
    history: dbSession.history.map(msg => ({
      role: msg.sender === 'bot' ? 'assistant' : 'user',
      content: msg.message
    })),
    dbId: dbSession._id
  });
  
  chatbotSockets.set(socket.id, socket);
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