// src/models/ChatSession.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  message: { type: String, required: true },
  sender: { type: String, enum: ['user', 'bot', 'portal'], required: true },
  timestamp: { type: Date, default: Date.now },
  images: [{
    data: { type: String }, // Base64 image data
    name: { type: String },
    mimeType: { type: String }
  }]
});

const chatSessionSchema = new mongoose.Schema({
  socketId: { type: String, required: true, unique: true },
  history: [messageSchema],
  lastMessage: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ChatSession', chatSessionSchema);