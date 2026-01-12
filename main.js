//main.js
const { app, BrowserWindow, screen, ipcMain, desktopCapturer, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { GlobalKeyboardListener } = require("node-global-key-listener");
const { spawn } = require('child_process');
const Tesseract = require('tesseract.js');
try { require('electron-reloader')(module); } catch (_) {}

app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disable-gpu-program-cache");
app.commandLine.appendSwitch("disable-gpu");

let mainWindow;
let tray = null; 
let isWindowVisible = false;
let watcherProcess = null;
let isExiting = false;
let currentDisplay = null;

const iconPath = path.join(__dirname, 'assets', 'dragon.ico');

function createWatchdog() {
  if (process.platform === 'win32') {
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
          spawn(appPath, [], {
            detached: true,
            stdio: 'ignore'
          }).unref();
          process.exit(0);
        }
      }
      
      checkParent();
    `;
    
    const fs = require('fs');
    const os = require('os');
    const watchdogPath = path.join(os.tmpdir(), 'electron-watchdog.js');
    fs.writeFileSync(watchdogPath, watchdogScript);
    
    watcherProcess = spawn('node', [watchdogPath, process.execPath, process.pid], {
      detached: true,
      stdio: 'ignore'
    });
    watcherProcess.unref();
    
    console.log('Watchdog process started - app will auto-restart if killed');
  }
}

function createBackgroundWindow() {
  currentDisplay = screen.getPrimaryDisplay();
  const { width, height } = currentDisplay.workAreaSize;
  
  mainWindow = new BrowserWindow({
    width: Math.floor((width)/3),
    height: Math.floor((height/1.3)),
    x: Math.floor(width - (width)/3),
    y: Math.floor((height/8)),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: true,
    resizable: true,
    type: 'toolbar',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      webviewTag: true // Enable webview for browser integration
    }
  });
  
  mainWindow.loadFile('index.html');
  mainWindow.setContentProtection(true);
  
  isWindowVisible = true;
  mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  
  mainWindow.on('blur', () => {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
      }
    }, 10);
  });
  
  mainWindow.on('focus', () => {
    mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  });
  
  screen.on('display-added', handleDisplayChange);
  screen.on('display-removed', handleDisplayChange);
  screen.on('display-metrics-changed', handleDisplayChange);
  
  monitorScreenCapture();
}

function handleDisplayChange() {
  if (!mainWindow) return;
  
  const windowBounds = mainWindow.getBounds();
  const displays = screen.getAllDisplays();
  
  const displayWithWindow = displays.find(display => {
    const { x, y, width, height } = display.bounds;
    return windowBounds.x >= x && 
           windowBounds.x < x + width &&
           windowBounds.y >= y && 
           windowBounds.y < y + height;
  });
  
  if (displayWithWindow) {
    currentDisplay = displayWithWindow;
    console.log('Window is on display:', currentDisplay.id);
  }
}

function createTray() {
  const trayIcon = nativeImage.createFromPath(iconPath);
  const resizedIcon = trayIcon.resize({ width: 16, height: 16 });
  
  tray = new Tray(resizedIcon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide Window',
      click: () => {
        toggleWindow();
      }
    },
    {
      label: 'Screenshot (Space+Space+Space+S)',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('trigger-screenshot');
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Move to Display',
      submenu: screen.getAllDisplays().map((display, index) => ({
        label: `Display ${index + 1} (${display.bounds.width}x${display.bounds.height})`,
        click: () => moveToDisplay(display)
      }))
    },
    { type: 'separator' },
    {
      label: 'Auto-Restart: Enabled',
      enabled: false
    },
    {
      label: 'Quit (Permanently)',
      click: () => {
        isExiting = true;
        if (watcherProcess) {
          watcherProcess.kill();
        }
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('Dragon Chatbot');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    toggleWindow();
  });
}

function moveToDisplay(display) {
  if (!mainWindow) return;
  
  const { x, y, width, height } = display.workArea;
  
  mainWindow.setBounds({
    x: Math.floor(x + width - (width/3)),
    y: Math.floor(y + (height/8)),
    width: Math.floor((width)/3),
    height: Math.floor((height/1.3))
  });
  
  mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  
  currentDisplay = display;
  console.log('Moved window to display:', display.id);
}

function toggleWindow() {
  if (!mainWindow) return;
  
  if (isWindowVisible) {
    mainWindow.hide();
    isWindowVisible = false;
  } else {
    mainWindow.show();
    isWindowVisible = true;
    mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  }
}


ipcMain.handle('extract-text-from-image', async (event, imageData) => {
  try {
    // console.log('Starting OCR text extraction...');
    
    // Convert base64 to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Perform OCR
    const { data: { text } } = await Tesseract.recognize(
      buffer,
      'eng',
      
    );
    
    // console.log('OCR completed. Extracted text length:', text.length);
    return { success: true, text: text.trim() };
    
  } catch (error) {
    console.error('OCR extraction error:', error);
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
      height: 5
    });
    
    mainWindow.setResizable(false);
  }
});

ipcMain.on("restore-from-folder", () => {
  if (mainWindow) {
    const { width, height } = currentDisplay.workAreaSize;   
    const currentBounds = mainWindow.getBounds();
    
    mainWindow.setBounds({
      x: currentBounds.x,
      y: currentBounds.y,
      width: Math.floor((width)/3),
      height: Math.floor((height)/1.3)
    });
  }
});

ipcMain.handle('capture-screenshot', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 3840, height: 2160 }
    });
    
    if (sources.length > 0) {
      const windowBounds = mainWindow.getBounds();
      const displays = screen.getAllDisplays();
      
      let targetDisplay = displays[0];
      for (const display of displays) {
        const { x, y, width, height } = display.bounds;
        if (windowBounds.x >= x && windowBounds.x < x + width) {
          targetDisplay = display;
          break;
        }
      }
      
      const displayIndex = displays.indexOf(targetDisplay);
      const source = sources[displayIndex] || sources[0];
      
      return source.thumbnail.toDataURL();
    }
    return null;
  } catch (error) {
    console.error('Screenshot capture error:', error);
    return null;
  }
});

ipcMain.handle('capture-full-page', async () => {
  try {
    const image = await mainWindow.webContents.capturePage();
    return image.toDataURL();
  } catch (error) {
    console.error('Full page capture error:', error);
    return null;
  }
});

ipcMain.handle('get-audio-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen']
    });
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL()
    }));
  } catch (error) {
    console.error('Error getting audio sources:', error);
    return [];
  }
});

let spaceCount = 0;
let lastSpaceTime = 0;
let isWaitingForAction = false;
const SPACE_TIMEOUT = 800;
const ACTION_TIMEOUT = 1500;
let keyboardListener = null;

function resetSpaceSequence() {
  spaceCount = 0;
  isWaitingForAction = false;
  lastSpaceTime = 0;
}

function setupKeyboardHook() {
  keyboardListener = new GlobalKeyboardListener();
  
  console.log('Keyboard hook initialized. Shortcuts active:');
  console.log('  Space+Space+Space+A - Show/Hide Window');
  console.log('  Space+Space+Space+S - Screenshot');
  console.log('  Space+Space+Space+V - Voice Recording');
  
  keyboardListener.addListener(function (e, down) {
    if (e.state !== "DOWN") return;
    
    const now = Date.now();
    const keyName = e.name.toUpperCase();
    
    if (keyName === "SPACE") {
      if (now - lastSpaceTime > SPACE_TIMEOUT || isWaitingForAction) {
        resetSpaceSequence();
      }
      
      spaceCount++;
      lastSpaceTime = now;
      
      if (spaceCount === 3) {
        isWaitingForAction = true;
        console.log('Triple space detected! Waiting for action key (A/S/V)...');
        
        setTimeout(() => {
          if (isWaitingForAction) {
            console.log('Action timeout - sequence reset');
            resetSpaceSequence();
          }
        }, ACTION_TIMEOUT);
      }
    }
    else if (keyName === "A" && isWaitingForAction) {
      console.log('Space Space Space A - Toggle Window');
      toggleWindow();
      resetSpaceSequence();
    }
    else if (keyName === "S" && isWaitingForAction) {
      console.log('Space Space Space S - Screenshot');
      if (mainWindow) {
        mainWindow.webContents.send('trigger-screenshot');
        if (!isWindowVisible) {
          mainWindow.show();
          isWindowVisible = true;
        }
      }
      resetSpaceSequence();
    }
    else if (keyName === "V" && isWaitingForAction) {
      console.log('Space Space Space V - Voice Recording');
      if (mainWindow) {
        mainWindow.webContents.send('trigger-voice-record');
        if (!isWindowVisible) {
          mainWindow.show();
          isWindowVisible = true;
        }
      }
      resetSpaceSequence();
    }
    // Add this in your keyboard listener, after the 'V' case:
    else if (keyName === "O" && isWaitingForAction) {
      console.log('Space Space Space O - OCR Screenshot');
      if (mainWindow) {
        mainWindow.webContents.send('trigger-ocr');
        if (!isWindowVisible) {
          mainWindow.show();
          isWindowVisible = true;
        }
      }
      resetSpaceSequence();
    }
    else if (spaceCount > 0 || isWaitingForAction) {
      resetSpaceSequence();
    }
  });
}

app.whenReady().then(() => {
  createBackgroundWindow();
  createTray();
  setupKeyboardHook();
  createWatchdog();
});

app.on('will-quit', (event) => {
  if (keyboardListener) {
    keyboardListener.kill();
  }
  
  if (!isExiting && watcherProcess) {
    console.log('App killed unexpectedly - watchdog will restart...');
  }
});

function monitorScreenCapture() {
  const { exec } = require('child_process');
  
  setInterval(() => {
    if (process.platform === 'win32') {
      exec('tasklist', (err, stdout) => {
        if (err) return;
        
        const suspiciousProcesses = [
          'obs64.exe', 'obs32.exe', 'obs.exe',
          'sharex.exe',
          'bandicam.exe',
          'fraps.exe',
          'camtasia.exe',
          'snagit.exe',
          'screenrec.exe'
        ];
        
        const lower = stdout.toLowerCase();
        const detected = suspiciousProcesses.some(proc => lower.includes(proc));
        
        if (detected && mainWindow) {
          mainWindow.webContents.send('capture-detected');
        }
      });
    }
  }, 2000);
}

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createBackgroundWindow();
  }
});

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
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