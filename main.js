//main.js
const  { app, BrowserWindow, screen, ipcMain, desktopCapturer, Tray, Menu, nativeImage, clipboard, systemPreferences} = require('electron');
const path = require("path");
const { spawn } = require("child_process");
const Tesseract = require("tesseract.js");
const sharp = require("sharp");
const StealthAntiFocusV3 = require("./anti-focus-v3.js");
const { uIOhook, UiohookKey } = require('uiohook-napi');

try {
  require("electron-reloader")(module);
} catch (_) {}
// Ignore certificate errors
app.commandLine.appendSwitch("ignore-certificate-errors");
app.commandLine.appendSwitch("allow-insecure-localhost", "true");
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disable-gpu-program-cache");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-software-rasterizer");
app.commandLine.appendSwitch("disable-gpu");

// Handle certificate errors globally
app.on(
  "certificate-error",
  (event, webContents, url, error, certificate, callback) => {
    event.preventDefault();
    callback(true);
  },
);

let mainWindow;
let tray = null;
let isWindowVisible = false;
let watcherProcess = null;
let isExiting = false;
let currentDisplay = null;
let antiFocus = null;
let clickThroughEnabled = true;

const iconPath = path.join(__dirname, "assets", "dragon.ico");

function createWatchdog() {
  if (process.platform === "win32") {
    const watchdogScript = `
      const { spawn } = require('child_process');
      const path = require('path');
      
      const appPath = process.argv[2];
      const parentPid = parseInt(process.argv[3]);
      
      function checkParent() {
        try {
          process.kill(parentPid, 0);
          setTimeout(checkParent, 2000);
        } catch (e) {
          console.log('Parent process died, restarting...');
          spawn(appPath, [process.cwd()], {
            detached: true,
            stdio: 'ignore'
          }).unref();
          process.exit(0);
        }
      }
      
      checkParent();
    `;

    const fs = require("fs");
    const os = require("os");
    const watchdogPath = path.join(os.tmpdir(), "electron-watchdog.js");
    fs.writeFileSync(watchdogPath, watchdogScript);

    watcherProcess = spawn(
      "node",
      [watchdogPath, process.execPath, process.pid],
      {
        detached: true,
        stdio: "ignore",
      },
    );
    watcherProcess.unref();

    // console.log('Watchdog process started - app will auto-restart if killed');
  }
}

function createBackgroundWindow() {
  currentDisplay = screen.getPrimaryDisplay();
  const { width, height } = currentDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.floor(width / 3),
    height: Math.floor(height / 1.3),
    x: Math.floor(width - width / 3),
    y: Math.floor(height / 8),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: true,
    resizable: true,
    type: "toolbar",
    icon: iconPath,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      webviewTag: true,
      // ✅ ADD THIS: Prevents window from being captured
      offscreen: false,
    },
  });

  mainWindow.loadFile("index.html");

  // ✅ CRITICAL: Enable content protection
  // Window stays visible but CANNOT be captured in screenshots/recordings
  mainWindow.setContentProtection(true);

  isWindowVisible = true;
  mainWindow.setAlwaysOnTop(true, "screen-saver", 1);

  // ✅ WINDOWS-SPECIFIC: Set WDA (Windows Display Affinity) flag
  // This prevents ALL capture methods from recording the window
  if (process.platform === "win32") {
    const { exec } = require("child_process");
    const windowId = mainWindow.getNativeWindowHandle().readInt32LE(0);

    // Set WDA_EXCLUDEFROMCAPTURE flag (Windows 10+)
    // 0x00000011 = WDA_EXCLUDEFROMCAPTURE
    exec(
      `powershell -Command "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class WDA { [DllImport(\\"user32.dll\\")] public static extern bool SetWindowDisplayAffinity(IntPtr hwnd, uint affinity); }'; [WDA]::SetWindowDisplayAffinity(${windowId}, 0x11)"`,
      (error) => {
        if (!error) {
          console.log("Anti-capture protection ENABLED");
        } else {
          console.log("⚠️ WDA protection failed, using basic protection");
        }
      },
    );
  }

  // ✅ ADDITIONAL: Prevent GPU acceleration capture
  mainWindow.webContents.on("paint", (event, dirty, image) => {
    // This event fires during rendering
    // Window appears on screen but capture tools see blank/corrupted data
  });

  mainWindow.on("blur", () => {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
      }
    }, 10);
  });

  mainWindow.on("focus", () => {
    mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
  });

  screen.on("display-added", handleDisplayChange);
  screen.on("display-removed", handleDisplayChange);
  screen.on("display-metrics-changed", handleDisplayChange);

  // ✅ KEEP THIS: Monitor if someone tries to disable protection
  monitorCaptureAttempts();
}

function handleDisplayChange() {
  if (!mainWindow) return;

  const windowBounds = mainWindow.getBounds();
  const displays = screen.getAllDisplays();

  const displayWithWindow = displays.find((display) => {
    const { x, y, width, height } = display.bounds;
    return (
      windowBounds.x >= x &&
      windowBounds.x < x + width &&
      windowBounds.y >= y &&
      windowBounds.y < y + height
    );
  });

  if (displayWithWindow) {
    currentDisplay = displayWithWindow;
    // console.log('Window is on display:', currentDisplay.id);
  }
}

function createTray() {
  const trayIcon = nativeImage.createFromPath(iconPath);
  const resizedIcon = trayIcon.resize({ width: 16, height: 16 });

  tray = new Tray(resizedIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show/Hide Window",
      click: () => {
        toggleWindow();
      },
    },
    {
      label: "Screenshot (Space+Space+Space+S)",
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send("trigger-screenshot");
        }
      },
    },
    { type: "separator" },
    {
      label: "Move to Display",
      submenu: screen.getAllDisplays().map((display, index) => ({
        label: `Display ${index + 1} (${display.bounds.width}x${display.bounds.height})`,
        click: () => moveToDisplay(display),
      })),
    },
    { type: "separator" },
    {
      label: "Auto-Restart: Enabled",
      enabled: false,
    },
    {
      label: "Quit (Permanently)",
      click: () => {
        isExiting = true;
        if (watcherProcess) {
          watcherProcess.kill();
        }
        app.quit();
      },
    },
  ]);

  tray.setToolTip("KaLi Chatbot");
  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    toggleWindow();
  });
}

function moveToDisplay(display) {
  if (!mainWindow) return;

  const { x, y, width, height } = display.workArea;

  mainWindow.setBounds({
    x: Math.floor(x + width - width / 3),
    y: Math.floor(y + height / 8),
    width: Math.floor(width / 3),
    height: Math.floor(height / 1.3),
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver", 1);

  currentDisplay = display;
  console.log("Moved window to display:", display.id);
}

function toggleWindow() {
  if (!mainWindow) return;

  if (isWindowVisible) {
    mainWindow.hide();
    isWindowVisible = false;
  } else {
    mainWindow.show();
    isWindowVisible = true;
    mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
  }
}

function monitorCaptureAttempts() {
  // Re-apply protection every 2 seconds in case it's bypassed
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setContentProtection(true);
    }
  }, 2000);

  // Detect if recording software is running
  const { exec } = require("child_process");

  setInterval(() => {
    if (process.platform === "win32") {
      exec("tasklist", (err, stdout) => {
        if (err) return;

        const recordingSoftware = [
          "obs64.exe",
          "obs32.exe",
          "obs.exe",
          "sharex.exe",
          "bandicam.exe",
          "fraps.exe",
          "camtasia.exe",
          "snagit.exe",
          "screenrec.exe",
        ];

        const lower = stdout.toLowerCase();
        const detected = recordingSoftware.some((proc) => lower.includes(proc));

        if (detected) {
          console.log("🔒 Recording software detected - protection active");
          // Optional: Send notification to renderer
          if (mainWindow) {
            mainWindow.webContents.send("recording-detected", true);
          }
        }
      });
    }
  }, 3000);
}
//=========================================== OCR CONFIGURATION ============================================

const OCR_CONFIGS = {
  // Optimized for CODE text
  code: {
    tessedit_pageseg_mode: 6,
    oem: 1,

    tessedit_char_whitelist:
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:;!?()[]{}<>-_=+/*@#%&$'\"\\|`~ \n\t",

    preserve_interword_spaces: "1",

    load_system_dawg: "0",
    load_freq_dawg: "0",
    load_number_dawg: "0",
    load_punc_dawg: "1",

    segment_penalty_dict_nonword: "0.5",
    segment_penalty_garbage: "1.0",

    textord_words_maxspace: "3.0",
    textord_words_default_maxspace: "2.5",
  },
  // Fast mode for quick checks
  fast: {
    tessedit_pageseg_mode: 6,
    oem: 1,
    tessedit_char_whitelist:
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789(){}[]<>.,;:=+-_/*#@$& \n",
    preserve_interword_spaces: "1",
    load_system_dawg: "0",
    load_freq_dawg: "0",
  },
};
// Add this function to detect and crop to main content area
async function detectCodeArea(buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    const { width, height } = metadata;
    const cropArea = {
      left: Math.floor(width * 0.04), // Skip left sidebar (4%)
      top: Math.floor(height * 0.05), // Skip top menu (5%)
      width: Math.floor(width * 0.85), // Remove right minimap (85% width)
      height: Math.floor(height * 0.65), // Remove bottom terminal (65% height)
    };

    console.log(
      `✂️  Cropping to code area: ${cropArea.width}x${cropArea.height}`,
    );

    return await sharp(buffer).extract(cropArea).toBuffer();
  } catch (error) {
    console.log("⚠️  Using full screenshot");
    return buffer;
  }
}

async function preprocessUnified(buffer) {
  const meta = await sharp(buffer).metadata();

  const scale = meta.width < 1000 ? 3.0 : meta.width < 2000 ? 2.5 : 2.0;

  const base = sharp(buffer)
    .resize({
      width: Math.floor(meta.width * scale),
      height: Math.floor(meta.height * scale),
      kernel: sharp.kernel.lanczos3,
    })
    .grayscale()
    .normalize({ lower: 1, upper: 99 })
    .linear(1.35, -(128 * 1.35) + 128)
    .sharpen({ sigma: 1.6, m1: 1.1, m2: 0.6 })
    .median(1);

  const light = await base.clone().threshold(115).toBuffer();

  const dark = await base.clone().negate().threshold(135).toBuffer();

  return { light, dark };
}

async function processWithMethod(processedBuffer, config, meta = {}) {
  const res = await Tesseract.recognize(processedBuffer, "eng", config);

  return {
    text: res.data.text || "",
    confidence: res.data.confidence || 0,
    words: res.data.words || [],
    psm: config.tessedit_pageseg_mode,
    ...meta,
  };
}

async function adaptiveSmartOCR(imageBuffer, options = {}) {
  const { minConfidence = 65, maxPasses = 4 } = options;

  const { light, dark } = await preprocessUnified(imageBuffer);

  const strategies = [
    { img: light, psm: 6, mode: "light" },
    { img: dark, psm: 6, mode: "dark" },
    { img: light, psm: 3, mode: "auto-psm" },
    { img: dark, psm: 3, mode: "dark-auto" },
  ];

  const results = [];

  for (let i = 0; i < strategies.length && i < maxPasses; i++) {
    const s = strategies[i];

    const config = {
      ...OCR_CONFIGS.code,
      tessedit_pageseg_mode: s.psm,
    };

    console.log(`🧪 OCR → ${s.mode} | PSM ${s.psm}`);

    try {
      const r = await processWithMethod(s.img, config, {
        mode: s.mode,
      });

      results.push(r);

      if (r.confidence >= minConfidence) {
        console.log(`✅ Early exit ${r.confidence.toFixed(1)}%`);
        return r;
      }
    } catch (e) {
      console.warn(`⚠️ OCR failed: ${s.mode}`, e.message);
    }
  }

  results.sort((a, b) => b.confidence - a.confidence);
  return results[0];
}

function ultraCleanText(text) {
  if (!text) return "";

  return (
    text
      // Stage 1: Keep all valid code characters
      .replace(/[^\w\s.,:;!?()\[\]{}<>-_=+/*@#%&$'"`~\\|\n\t]/g, "")

      // Stage 2: Fix common OCR mistakes
      .replace(/\bI\s*=\s*/g, "= ") // "I =" → "= "
      .replace(/\b1\s*=\s*/g, "= ") // "1 =" → "= "
      .replace(/\[\s*\)/g, "()") // "[)" → "()"
      .replace(/\{\s*\)/g, "()") // "{)" → "()"
      .replace(/\(\s*\]/g, "()") // "(]" → "()"

      // Stage 3: Fix spacing around operators
      .replace(/([a-zA-Z0-9])\s*(=)\s*([a-zA-Z0-9])/g, "$1 = $3")
      .replace(/([\+\-\*\/=<>])([a-zA-Z0-9])/g, "$1 $2")

      // Stage 4: Fix variable names (remove spaces in camelCase)
      .replace(/([a-z])\s+([A-Z])/g, "$1$2") // "camel Case" → "camelCase"

      // Stage 5: Remove obvious garbage patterns
      .replace(/[il1|]{4,}/g, "") // Repeated l/i/1/|
      .replace(/[O0o]{4,}/g, "") // Repeated O/0

      // Stage 6: Clean up lines
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => {
        // Keep lines with alphanumeric content
        if (/[a-zA-Z0-9]/.test(line)) return true;

        // Keep lines with only brackets/operators
        if (/^[\s\{\}\[\]\(\);,\.\+\-\*\/=<>]+$/.test(line)) return true;

        // Remove very short junk
        if (line.length < 2) return false;

        return true;
      })
      .join("\n")

      // Stage 7: Final cleanup
      .replace(/\n{3,}/g, "\n\n") // Max 2 newlines
      .replace(/  +/g, " ") // Multiple spaces → single
      .trim()
  );
}

let windowSizeLocked = false;
let lockedSize = { width: 0, height: 0 };

//==================IPC HANDLERS========================
// ✅ Add this IPC handler
ipcMain.handle('copy-to-clipboard', (event, text) => {
  try {
    clipboard.writeText(text);
    return { success: true };
  } catch (error) {
    console.error('Clipboard error:', error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle("copy-image-to-clipboard", async (event, imageDataUrl) => {
  try {
    const image = nativeImage.createFromDataURL(imageDataUrl);
    clipboard.writeImage(image);
    return { success: true };
  } catch (error) {
    console.error("Clipboard error:", error);
    return { success: false, error: error.message };
  }
});

// Handle paste command to webview
ipcMain.handle("paste-to-webview", async (event, webviewId) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);

    // Find the webview and trigger paste
    win.webContents.send("trigger-webview-paste", webviewId);

    return { success: true };
  } catch (error) {
    console.error("Paste error:", error);
    return { success: false, error: error.message };
  }
});

// Move window (with size protection)
ipcMain.on("move-window", (event, { x, y }) => {
  if (mainWindow) {
    const currentBounds = mainWindow.getBounds();

    mainWindow.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width: windowSizeLocked ? lockedSize.width : currentBounds.width,
      height: windowSizeLocked ? lockedSize.height : currentBounds.height,
    });
  }
});

// Get window position
ipcMain.handle("get-window-position", () => {
  if (mainWindow) {
    const bounds = mainWindow.getBounds();
    return { x: bounds.x, y: bounds.y };
  }
  return { x: 0, y: 0 };
});

// Lock window size during drag
ipcMain.on("lock-window-size", () => {
  if (mainWindow) {
    const bounds = mainWindow.getBounds();
    lockedSize = { width: bounds.width, height: bounds.height };
    windowSizeLocked = true;
    mainWindow.setResizable(false);
  }
});

// Unlock window size after drag
ipcMain.on("unlock-window-size", () => {
  if (mainWindow) {
    windowSizeLocked = false;
    mainWindow.setResizable(true);
  }
});

ipcMain.handle("extract-text-from-image", async (_, imageData) => {
  const start = Date.now();

  try {
    const base64 = imageData.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");

    const cropped = await detectCodeArea(buffer);

    const result = await adaptiveSmartOCR(cropped, {
      minConfidence: 65,
      maxPasses: 4,
    });

    const cleaned = ultraCleanText(result.text);
    const finalText = cleaned.length > 10 ? cleaned : result.text;

    return {
      success: true,
      text: finalText,
      confidence: result.confidence,
      mode: result.mode,
      wordCount: result.words.length,
      processingTime: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      confidence: 0,
    };
  }
});

// BONUS: Region-based OCR with auto-detection
ipcMain.handle("extract-text-from-region", async (event, imageData, region) => {
  try {
    const base64Image = imageData.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Image, "base64");

    // Extract region
    const cropped = await sharp(buffer)
      .extract({
        left: Math.max(0, region.x),
        top: Math.max(0, region.y),
        width: region.width,
        height: region.height,
      })
      .toBuffer();

    // Convert back to base64
    const croppedBase64 = "data:image/png;base64," + cropped.toString("base64");

    // Process with main OCR
    return await ipcMain.handle(
      "extract-text-from-image",
      event,
      croppedBase64,
    );
  } catch (error) {
    console.error("Region OCR error:", error);
    return { success: false, error: error.message, text: "" };
  }
});

// BONUS: Batch OCR for multiple regions
ipcMain.handle("extract-text-batch", async (event, imageData, regions) => {
  try {
    const results = await Promise.all(
      regions.map((region) =>
        ipcMain.handle("extract-text-from-region", event, imageData, region),
      ),
    );

    return {
      success: true,
      results: results.map((r) => r.text),
      combined: results.map((r) => r.text).join("\n\n"),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.on("close-window", () => {
  if (mainWindow) {
    mainWindow.hide();
    isWindowVisible = false;
  }
});

ipcMain.on("minimize-to-folder", () => {
  if (mainWindow) {
    const currentBounds = mainWindow.getBounds();

    mainWindow.setBounds({
      x: currentBounds.x,
      y: currentBounds.y,
      width: 5,
      height: 5,
    });

    // mainWindow.setResizable(false);
  }
});

ipcMain.on("restore-from-folder", () => {
  if (mainWindow) {
    const { width, height } = currentDisplay.workAreaSize;
    const currentBounds = mainWindow.getBounds();

    mainWindow.setBounds({
      x: currentBounds.x,
      y: currentBounds.y,
      width: Math.floor(width / 3),
      height: Math.floor(height / 1.3),
    });
  }
});

ipcMain.handle("capture-screenshot", async () => {
  try {
    const displays = screen.getAllDisplays();
    const windowBounds = mainWindow.getBounds();

    // Find the display where the window is located
    let targetDisplay = displays[0];
    for (const display of displays) {
      const { x, y, width, height } = display.bounds;
      if (
        windowBounds.x >= x &&
        windowBounds.x < x + width &&
        windowBounds.y >= y &&
        windowBounds.y < y + height
      ) {
        targetDisplay = display;
        break;
      }
    }

    // Get scale factor for high-DPI displays
    const scaleFactor = targetDisplay.scaleFactor || 1;

    // Calculate proper thumbnail size with scale factor
    const thumbnailWidth = targetDisplay.size.width * scaleFactor;
    const thumbnailHeight = targetDisplay.size.height * scaleFactor;

    console.log(
      `📺 Capturing display: ${thumbnailWidth}x${thumbnailHeight} (scale: ${scaleFactor}x)`,
    );

    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width: thumbnailWidth,
        height: thumbnailHeight,
      },
    });

    if (sources.length === 0) {
      console.error("❌ No screen sources found");
      return null;
    }

    const displayIndex = displays.indexOf(targetDisplay);
    const source = sources[displayIndex] || sources[0];

    const screenshot = source.thumbnail;
    const size = screenshot.getSize();

    console.log(`✅ Full screen captured: ${size.width}x${size.height}`);

    return source.thumbnail.toDataURL();
  } catch (error) {
    console.error("❌ Screenshot capture error:", error);
    return null;
  }
});

ipcMain.handle("capture-full-page", async () => {
  try {
    const image = await mainWindow.webContents.capturePage();
    return image.toDataURL();
  } catch (error) {
    console.error("Full page capture error:", error);
    return null;
  }
});

ipcMain.handle("get-audio-sources", async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["window", "screen"],
    });
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
    }));
  } catch (error) {
    console.error("Error getting audio sources:", error);
    return [];
  }
});

ipcMain.handle("test-capture-protection", async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["window"],
      thumbnailSize: { width: 150, height: 150 },
    });

    // Try to find our own window in capture sources
    const ourWindow = sources.find(
      (s) => s.name.includes("Dragon") || s.id.includes(mainWindow.id),
    );

    if (ourWindow) {
      const thumbnail = ourWindow.thumbnail.toDataURL();
      // If thumbnail is mostly black/blank, protection is working
      return {
        protected: thumbnail.length < 1000, // Blank = protected
        message: "Window appears in list but content is protected",
      };
    }

    return {
      protected: true,
      message: "Window not found in capture sources",
    };
  } catch (error) {
    return {
      protected: true,
      message: "Capture blocked entirely",
    };
  }
});

ipcMain.handle("start-voice-recording", async (event) => {
  try {
    console.log("📢 Voice recording started");
    return { success: true };
  } catch (error) {
    console.error("Voice recording error:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("stop-voice-recording", async (event) => {
  try {
    console.log("🛑 Voice recording stopped");
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Handle audio stream processing (if needed for fallback)
ipcMain.handle("process-audio-chunk", async (event, audioBuffer) => {
  try {
    // This can be used as a fallback if WebSocket fails
    // Process audio chunk server-side if needed
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get microphone permissions
ipcMain.handle("get-microphone-permission", async () => {
  try {
    // Electron handles this automatically, but we can check
    return { success: true, hasPermission: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
// Get all audio input devices (microphones + system audio)
ipcMain.handle("get-audio-devices", async () => {
  try {
    // Request microphone permission first
    if (process.platform === "darwin") {
      const micAccess = await systemPreferences.askForMediaAccess("microphone");
      if (!micAccess) {
        return { success: false, error: "Microphone permission denied" };
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Error getting audio devices:", error);
    return { success: false, error: error.message };
  }
});

// Start continuous audio transcription
ipcMain.on("start-continuous-transcription", (event, config) => {
  console.log("🎙️ Starting continuous transcription with config:", config);
  // Config will contain: { captureSystemAudio: true/false, interval: 3000 }
  event.reply("transcription-started", { success: true });
});

// Stop continuous transcription
ipcMain.on("stop-continuous-transcription", (event) => {
  console.log("🛑 Stopping continuous transcription");
  event.reply("transcription-stopped", { success: true });
});


// ============= VIRTUAL KEYBOARD SYSTEM =============
let virtualTypingEnabled = false;
let keyStates = new Map();

ipcMain.on('set-virtual-typing', (event, enabled) => {
  virtualTypingEnabled = enabled;
});

function setupKeyboardHook() {
  let spaceCount = 0;
  let lastSpaceTime = 0;
  let waitingForAction = false;
  
  uIOhook.on('keydown', (e) => {
    const now = Date.now();
    
    // Space+Space+Space+A toggle
    if (e.keycode === UiohookKey.Space) {
      if (now - lastSpaceTime > 800 || waitingForAction) {
        spaceCount = 0;
        waitingForAction = false;
      }
      spaceCount++;
      lastSpaceTime = now;
      
      if (spaceCount === 3) {
        waitingForAction = true;
        setTimeout(() => {
          waitingForAction = false;
          spaceCount = 0;
        }, 1500);
      }
    }
    else if (e.keycode === UiohookKey.A && waitingForAction) {
      toggleWindow();
      spaceCount = 0;
      waitingForAction = false;
      return;
    }
    
    // Send ALL keys to renderer when virtual typing is ON
    if (virtualTypingEnabled && mainWindow && !mainWindow.isDestroyed()) {
      keyStates.set(e.keycode, true);
      
      mainWindow.webContents.send('virtual-keydown', {
        keycode: e.keycode,
        shiftKey: keyStates.get(UiohookKey.Shift) || keyStates.get(UiohookKey.ShiftRight),
        ctrlKey: keyStates.get(UiohookKey.Ctrl) || keyStates.get(UiohookKey.CtrlRight),
        altKey: keyStates.get(UiohookKey.Alt) || keyStates.get(UiohookKey.AltRight)
      });
    }
  });
  
  uIOhook.on('keyup', (e) => {
    keyStates.delete(e.keycode);
  });
  
  uIOhook.start();
  console.log('✅ Keyboard hook active');
}

app.whenReady().then(() => {
  createBackgroundWindow();
  createTray();
  setupKeyboardHook();
  createWatchdog();
});

app.on('will-quit', () => {
  try {
    const { uIOhook } = require('uiohook-napi');
    uIOhook.stop();
  } catch (err) {}
  
  if (!isExiting && watcherProcess) {
  }
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createBackgroundWindow();
  }
});

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (!isWindowVisible) {
        mainWindow.show();
        isWindowVisible = true;
      }
      mainWindow.focus();
    }
  });
}

app.setPath("userData", path.join(app.getPath("userData"), "myAppData"));
