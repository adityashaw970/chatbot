const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve static files
app.use(express.static(path.join(__dirname, "..")));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    service: "gemini-chatbot",
    timestamp: new Date().toISOString()
  });
});
app.get("/history", (req, res) => {
  res.sendFile(path.join(__dirname, '../public/history.html'));
});

// Root endpoint
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "index.html"));
});

module.exports = app;