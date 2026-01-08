const express = require('express');
const router = express.Router();
const ChatSession = require('../models/ChatSession');

// Get all chat sessions
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await ChatSession.find()
      .sort({ updatedAt: -1 })
      .select('-history')
      .limit(100);
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get messages for a specific session
router.get('/sessions/:sessionId/messages', async (req, res) => {
  try {
    const session = await ChatSession.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session.history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add message to session (from portal)
router.post('/sessions/:sessionId/messages', async (req, res) => {
  try {
    const { message, sender, timestamp } = req.body;
    
    const session = await ChatSession.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const newMessage = {
      message,
      sender: sender || 'portal',
      timestamp: timestamp || new Date(),
      images: []
    };

    session.history.push(newMessage);
    session.lastMessage = message;
    session.updatedAt = new Date();
    
    await session.save();
    
    res.json(newMessage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a session
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    await ChatSession.findByIdAndDelete(req.params.sessionId);
    res.json({ message: 'Session deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear session history
router.delete('/sessions/:sessionId/messages', async (req, res) => {
  try {
    const session = await ChatSession.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    session.history = [];
    session.lastMessage = '';
    session.updatedAt = new Date();
    await session.save();
    
    res.json({ message: 'History cleared successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;