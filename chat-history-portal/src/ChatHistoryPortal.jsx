import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Send,
  Trash2,
  RefreshCw,
  MessageSquare,
  Copy,
  Check,
} from "lucide-react";
import io from "socket.io-client";
import { marked } from "marked";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";
import javascript from "highlight.js/lib/languages/javascript";
import python from "highlight.js/lib/languages/python";
import DOMPurify from "dompurify";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("python", python);

const renderer = new marked.Renderer();

renderer.code = (codeObj) => {
  const code = typeof codeObj === "string" ? codeObj : codeObj.text || "";
  const language = codeObj.lang || "plaintext";

  const validLang = hljs.getLanguage(language) ? language : "plaintext";
  const highlighted = hljs.highlight(code, { language: validLang }).value;
  const escaped = code.replace(/"/g, "&quot;");

  return `
    <div class="relative group my-4">
      <button 
        class="copy-code-btn absolute top-2 right-2 text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition"
        data-code="${escaped}"
      >
        Copy
      </button>
      <pre class="rounded-lg overflow-x-auto p-3">
        <code class="hljs language-${validLang}">
          ${highlighted}
        </code>
      </pre>
    </div>
  `;
};

marked.setOptions({
  renderer,
  breaks: true,
  gfm: true,
});

const ChatHistoryPortal = () => {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [selectedSessions, setSelectedSessions] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [imageZoom, setImageZoom] = useState(1);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const autoRefreshInterval = useRef(null);
  const imageRef = useRef(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const imageOffset = useRef({ x: 0, y: 0 });

  const API_URL = "https://chatbot-al0x.onrender.com";
  // const API_URL = "http://localhost:3000/";

  useEffect(() => {
    const handler = (e) => {
      if (e.target.classList.contains("copy-code-btn")) {
        const code = e.target.dataset.code;
        navigator.clipboard.writeText(code);
        e.target.innerText = "Copied!";
        setTimeout(() => {
          e.target.innerText = "Copy";
        }, 1500);
      }
    };

    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  useEffect(() => {
    fetchSessions();
    connectSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (autoRefreshInterval.current) {
        clearInterval(autoRefreshInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Close lightbox on ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && lightboxImage) {
        closeLightbox();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxImage]);

  // Auto-refresh when enabled
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshInterval.current = setInterval(() => {
        if (selectedSession) {
          fetchMessages(selectedSession, true);
        }
        fetchSessions();
      }, 3000);
    } else {
      if (autoRefreshInterval.current) {
        clearInterval(autoRefreshInterval.current);
      }
    }

    return () => {
      if (autoRefreshInterval.current) {
        clearInterval(autoRefreshInterval.current);
      }
    };
  }, [autoRefresh, selectedSession]);

  const connectSocket = () => {
    const socket = io(API_URL, {
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      console.log("Socket.IO connected:", socket.id);
      setConnected(true);
      socket.emit("identify", { type: "portal" });
    });

    socket.on("disconnect", () => {
      console.log("Socket.IO disconnected");
      setConnected(false);
    });

    socket.on("connect_error", (error) => {
      console.error("Socket.IO connection error:", error);
      setConnected(false);
    });

    socket.on("session_updated", (data) => {
      console.log("Session updated:", data);
      fetchSessions();
      if (selectedSession === data.sessionId) {
        fetchMessages(data.sessionId, true);
      }
    });

    socketRef.current = socket;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  };

  const copyToClipboard = async (text, messageId) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const copyImageToClipboard = async (imageData, imageId) => {
    try {
      const response = await fetch(imageData);
      const blob = await response.blob();

      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);

      setCopiedMessageId(imageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (error) {
      console.error("Failed to copy image:", error);
      try {
        await navigator.clipboard.writeText(imageData);
        setCopiedMessageId(imageId);
        setTimeout(() => setCopiedMessageId(null), 2000);
      } catch {
        alert("Failed to copy image");
      }
    }
  };

  const openLightbox = (imageData) => {
    setLightboxImage(imageData);
    setImageZoom(1);
  };

  const closeLightbox = () => {
    setLightboxImage(null);
    setImageZoom(1);
    imageOffset.current = { x: 0, y: 0 };
  };

  const zoomIn = () => {
    setImageZoom((prev) => Math.min(prev + 0.25, 3));
  };

  const zoomOut = () => {
    setImageZoom((prev) => Math.max(prev - 0.25, 0.5));
  };

  // Mouse wheel zoom
  const handleWheelZoom = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    setImageZoom((prev) => Math.min(Math.max(prev + delta, 0.5), 4));
  };

  // Drag start
  const handleMouseDown = (e) => {
    if (imageZoom <= 1) return;
    isDragging.current = true;
    dragStart.current = {
      x: e.clientX - imageOffset.current.x,
      y: e.clientY - imageOffset.current.y,
    };
  };

  // Drag move
  const handleMouseMove = (e) => {
    if (!isDragging.current) return;

    imageOffset.current = {
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    };

    if (imageRef.current) {
      imageRef.current.style.transform = `
      translate(${imageOffset.current.x}px, ${imageOffset.current.y}px)
      scale(${imageZoom})
    `;
    }
  };

  // Drag end
  const handleMouseUp = () => {
    isDragging.current = false;
  };

  // Double click zoom toggle
  const handleDoubleClick = () => {
    if (imageZoom === 1) {
      setImageZoom(2);
    } else {
      setImageZoom(1);
      imageOffset.current = { x: 0, y: 0 };
    }
  };

  const resetZoom = () => {
    setImageZoom(1);
  };

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/sessions`);
      const data = await response.json();

      // Sort by updatedAt to show most recent (active) first
      const sortedSessions = data.sort(
        (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
      );

      setSessions(sortedSessions);
    } catch (error) {
      console.error("Error fetching sessions:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (sessionId, silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await fetch(
        `${API_URL}/api/sessions/${sessionId}/messages`
      );
      const data = await response.json();
      setMessages(data);
      setSelectedSession(sessionId);
      setTimeout(() => scrollToBottom(), 100);
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const sendMessageToChatbot = async () => {
    if (!newMessage.trim() || !selectedSession) return;

    try {
      const response = await fetch(
        `${API_URL}/api/sessions/${selectedSession}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: newMessage }),
        }
      );

      if (response.ok) {
        const savedMessage = await response.json();
        setMessages((prev) => [...prev, savedMessage]);
        setNewMessage("");
        setTimeout(() => scrollToBottom(), 100);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Failed to send message. Make sure the server is running.");
    }
  };

  const deleteSession = async (sessionId) => {
    if (!window.confirm("Delete this chat session?")) return;

    try {
      await fetch(`${API_URL}/api/sessions/${sessionId}`, { method: "DELETE" });
      fetchSessions();
      if (selectedSession === sessionId) {
        setSelectedSession(null);
        setMessages([]);
      }
    } catch (error) {
      console.error("Error deleting session:", error);
    }
  };

  const toggleSelectSession = (sessionId) => {
    const newSelected = new Set(selectedSessions);
    if (newSelected.has(sessionId)) {
      newSelected.delete(sessionId);
    } else {
      newSelected.add(sessionId);
    }
    setSelectedSessions(newSelected);
  };

  const selectAllSessions = () => {
    if (selectedSessions.size === filteredSessions.length) {
      setSelectedSessions(new Set());
    } else {
      setSelectedSessions(new Set(filteredSessions.map((s) => s._id)));
    }
  };

  const deleteSelectedSessions = async () => {
    if (selectedSessions.size === 0) return;
    if (!window.confirm(`Delete ${selectedSessions.size} selected session(s)?`))
      return;

    try {
      const deletePromises = Array.from(selectedSessions).map((sessionId) =>
        fetch(`${API_URL}/api/sessions/${sessionId}`, { method: "DELETE" })
      );
      await Promise.all(deletePromises);
      setSelectedSessions(new Set());
      setSelectMode(false);
      fetchSessions();
      if (selectedSessions.has(selectedSession)) {
        setSelectedSession(null);
        setMessages([]);
      }
    } catch (error) {
      console.error("Error deleting sessions:", error);
      alert("Failed to delete some sessions");
    }
  };

  const deleteAllSessions = async () => {
    if (
      !window.confirm(
        `Delete ALL ${sessions.length} sessions? This cannot be undone!`
      )
    )
      return;

    try {
      const response = await fetch(`${API_URL}/api/sessions/all`, {
        method: "DELETE",
      });
      if (response.ok) {
        setSelectedSessions(new Set());
        setSelectMode(false);
        setSelectedSession(null);
        setMessages([]);
        fetchSessions();
        alert("All sessions deleted successfully!");
      }
    } catch (error) {
      console.error("Error deleting all sessions:", error);
      alert("Failed to delete all sessions");
    }
  };

  const filteredSessions = sessions.filter(
    (session) =>
      session.socketId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function renderMarkdown(text) {
    if (!text) return "";
    const dirty = marked.parse(text);
    return DOMPurify.sanitize(dirty, {
      USE_PROFILES: { html: true },
    });
  }

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center"
          onClick={closeLightbox}
        >
          <div className="relative w-full h-full flex items-center justify-center p-4">
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 bg-red-600 hover:bg-red-700 text-white rounded-full w-10 h-10 flex items-center justify-center z-10 transition"
            >
              ✕
            </button>

            <div className="absolute top-4 left-4 bg-gray-800 bg-opacity-90 rounded-lg p-2 flex gap-2 z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  zoomOut();
                }}
                className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded transition"
              >
                −
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  resetZoom();
                }}
                className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded transition"
              >
                {Math.round(imageZoom * 100)}%
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  zoomIn();
                }}
                className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded transition"
              >
                +
              </button>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                copyImageToClipboard(lightboxImage, "lightbox");
              }}
              className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition z-10"
            >
              {copiedMessageId === "lightbox" ? (
                <>
                  <Check size={16} />
                  Copied!
                </>
              ) : (
                <>
                  <Copy size={16} />
                  Copy Image
                </>
              )}
            </button>

            <div
              className="overflow-auto max-w-full max-h-full"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                ref={imageRef}
                src={lightboxImage}
                alt="Full size view"
                onWheel={handleWheelZoom}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onDoubleClick={handleDoubleClick}
                draggable={false}
                style={{
                  transform: `translate(${imageOffset.current.x}px, ${imageOffset.current.y}px) scale(${imageZoom})`,
                  transition: isDragging.current
                    ? "none"
                    : "transform 0.2s ease",
                  maxWidth: "90vw",
                  maxHeight: "90vh",
                  objectFit: "contain",
                  cursor: imageZoom > 1 ? "grab" : "zoom-in",
                }}
                className="select-none"
              />
            </div>

            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-800 bg-opacity-90 rounded-lg px-4 py-2 text-sm text-gray-300">
              Click outside or press ESC to close
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold mb-3 flex items-center gap-2">
            <MessageSquare size={24} />
            Chat History Portal
          </h1>
          <div className="relative">
            <Search
              className="absolute left-3 top-2.5 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
            />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span
              className={`text-sm flex items-center gap-2 ${
                connected ? "text-green-400" : "text-red-400"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: connected ? "#4ade80" : "#f87171" }}
              ></span>
              {connected ? "Connected" : "Disconnected"}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-3 py-1 text-xs rounded-lg transition flex items-center gap-1 ${
                  autoRefresh
                    ? "bg-green-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
                title={
                  autoRefresh
                    ? "Auto-refresh ON (every 3s)"
                    : "Auto-refresh OFF"
                }
              >
                <RefreshCw
                  size={12}
                  className={autoRefresh ? "animate-spin" : ""}
                />
                {autoRefresh ? "Auto" : "Manual"}
              </button>
              <button
                onClick={() => setSelectMode(!selectMode)}
                className={`px-3 py-1 text-xs rounded-lg transition ${
                  selectMode
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                {selectMode ? "Cancel" : "Select"}
              </button>
              <button
                onClick={fetchSessions}
                className="p-2 hover:bg-gray-700 rounded-lg transition"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          {selectMode && (
            <div className="mt-3 flex flex-col gap-2">
              <button
                onClick={selectAllSessions}
                className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition"
              >
                {selectedSessions.size === filteredSessions.length
                  ? "Deselect All"
                  : "Select All"}
              </button>
              {selectedSessions.size > 0 && (
                <>
                  <button
                    onClick={deleteSelectedSessions}
                    className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm transition"
                  >
                    Delete Selected ({selectedSessions.size})
                  </button>
                  <button
                    onClick={deleteAllSessions}
                    className="w-full px-3 py-2 bg-red-800 hover:bg-red-900 rounded-lg text-sm transition"
                  >
                    Delete ALL Sessions ({sessions.length})
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && sessions.length === 0 ? (
            <div className="p-4 text-center text-gray-400">Loading...</div>
          ) : filteredSessions.length === 0 ? (
            <div className="p-4 text-center text-gray-400">
              {sessions.length === 0
                ? "No sessions yet. Start chatting in your Electron app!"
                : "No sessions found"}
            </div>
          ) : (
            filteredSessions.map((session, index) => {
              const isActive = index === 0; // Most recent is active
              const timeSinceUpdate =
                Date.now() - new Date(session.updatedAt).getTime();
              const isRecentlyActive = timeSinceUpdate < 60000; // Active in last 60 seconds

              return (
                <div
                  key={session._id}
                  className={`p-4 border-b border-gray-700 cursor-pointer hover:bg-gray-700 transition ${
                    selectedSession === session._id ? "bg-gray-700" : ""
                  } ${
                    selectedSessions.has(session._id)
                      ? "border-l-4 border-l-blue-500"
                      : ""
                  }
                  ${
                    isActive && isRecentlyActive
                      ? "border-l-4 border-l-green-500 bg-gray-750"
                      : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {selectMode && (
                      <input
                        type="checkbox"
                        checked={selectedSessions.has(session._id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSelectSession(session._id);
                        }}
                        className="mt-1 w-4 h-4 cursor-pointer"
                      />
                    )}
                    <div
                      className="flex-1"
                      onClick={() => !selectMode && fetchMessages(session._id)}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm truncate">
                            {session.socketId?.slice(0, 12)}...
                          </span>
                          {isActive && isRecentlyActive && (
                            <span className="px-2 py-0.5 bg-green-600 bg-opacity-20 border border-green-500 rounded text-xs text-white flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                              Active
                            </span>
                          )}
                        </div>
                        {!selectMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSession(session._id);
                            }}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">
                        {session.lastMessage 
                          ? (session.lastMessage.length > 60 
                              ? session.lastMessage.substring(0, 60) + '...' 
                              : session.lastMessage)
                          : "No messages yet"}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(session.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedSession ? (
          <>
            <div className="p-4 border-b border-gray-700 bg-gray-800">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="font-semibold">Chat Session</h2>
                  <p className="text-sm text-gray-400">
                    {messages.length} messages
                    {autoRefresh && (
                      <span className="ml-2 text-green-400">● Auto-Scroll</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => scrollToBottom()}
                  className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded-lg transition"
                >
                  ↓ Scroll to Bottom
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center text-gray-400 mt-8">
                  No messages in this session yet
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const messageId = `${idx}-${msg.timestamp}`;
                  return (
                    <div
                      key={idx}
                      className={`flex ${
                        msg.sender === "portal"
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-3xl px-5 py-3 rounded-2xl relative group shadow-md ${
                          msg.sender === "portal"
                            ? "bg-purple-600 text-white ml-auto"
                            : msg.sender === "bot"
                            ? "bg-gray-800 text-white border border-gray-700"
                            : "bg-blue-600 text-white"
                        }`}
                      >
                        {msg.images && msg.images.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-2">
                            {msg.images.map((img, imgIdx) => {
                              const imageId = `${messageId}-img-${imgIdx}`;
                              const imageData = img.data || img;
                              return (
                                <div
                                  key={imgIdx}
                                  className="relative group/img"
                                >
                                  <img
                                    src={imageData}
                                    alt={img.name || `Image ${imgIdx + 1}`}
                                    className="max-w-xs max-h-48 rounded border-2 border-white border-opacity-20 cursor-pointer hover:border-opacity-40 transition"
                                    onClick={() => openLightbox(imageData)}
                                    title="Click to view full size"
                                  />
                                  <div className="absolute top-1 left-1 bg-black bg-opacity-70 px-2 py-1 rounded text-xs opacity-0 group-hover/img:opacity-100 transition">
                                    {img.name || "Image"}
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyImageToClipboard(imageData, imageId);
                                    }}
                                    className="absolute top-1 right-1 p-1 bg-black bg-opacity-70 hover:bg-opacity-90 rounded transition opacity-0 group-hover/img:opacity-100"
                                    title="Copy image"
                                  >
                                    {copiedMessageId === imageId ? (
                                      <Check
                                        size={14}
                                        className="text-green-400"
                                      />
                                    ) : (
                                      <Copy size={14} />
                                    )}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {msg.message && (
                          <div
                            className="prose prose-invert max-w-none text-sm leading-relaxed"
                            dangerouslySetInnerHTML={{
                              __html: renderMarkdown(msg.message),
                            }}
                          />
                        )}

                        <p className="text-xs opacity-70 mt-1">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </p>

                        <button
                          onClick={() =>
                            copyToClipboard(msg.message, messageId)
                          }
                          className="absolute top-2 right-2 p-1 bg-black bg-opacity-30 hover:bg-opacity-50 rounded transition opacity-0 group-hover:opacity-100"
                          title="Copy message"
                        >
                          {copiedMessageId === messageId ? (
                            <Check size={14} className="text-green-400" />
                          ) : (
                            <Copy size={14} />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-gray-700 bg-gray-800">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) =>
                    e.key === "Enter" && sendMessageToChatbot()
                  }
                  placeholder="Type a message to send to chatbot..."
                  className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={!connected}
                />
                <button
                  onClick={sendMessageToChatbot}
                  disabled={!newMessage.trim() || !connected}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
                >
                  <Send size={18} />
                  Send
                </button>
              </div>
              {!connected && (
                <p className="text-xs text-red-400 mt-2">
                  Disconnected from server. Please check if your backend is
                  running.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <MessageSquare size={48} className="mx-auto mb-4 opacity-50" />
              <p>Select a chat session to view messages</p>
              <p className="text-sm mt-2 text-gray-500">
                Start chatting in your Electron app to create sessions
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatHistoryPortal;
