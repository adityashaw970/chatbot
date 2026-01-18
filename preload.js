const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  closeWindow: () => ipcRenderer.send('close-window'),
  
  minimizeToFolder: () => ipcRenderer.send('minimize-to-folder'),
  
  restoreFromFolder: () => ipcRenderer.send('restore-from-folder'),
  
  // Simple drag functions
  moveWindow: (x, y) => ipcRenderer.send('move-window', { x, y }),
  
  getWindowPosition: () => ipcRenderer.invoke('get-window-position'),
  
  lockWindowSize: () => ipcRenderer.send('lock-window-size'),
  
  unlockWindowSize: () => ipcRenderer.send('unlock-window-size'),
  
  // Screenshot and capture
  captureScreen: () => ipcRenderer.invoke('capture-screenshot'),
  
  captureFullPage: () => ipcRenderer.invoke('capture-full-page'),
  
  getAudioSources: () => ipcRenderer.invoke('get-audio-sources'),
  
  // OCR
  extractTextFromImage: (imageData) => ipcRenderer.invoke('extract-text-from-image', imageData),

  // Event listeners
  onOcrTrigger: (callback) => {
    ipcRenderer.on('trigger-ocr', callback);
  },
  
  onScreenshotTrigger: (callback) => {
    ipcRenderer.on('trigger-screenshot', callback);
  },
  
  onVoiceRecordTrigger: (callback) => {
    ipcRenderer.on('trigger-voice-record', callback);
  },
  
  onRestore: (callback) => {
    ipcRenderer.on('restore-window', callback);
  },
  
  onCaptureDetected: (callback) => {
    ipcRenderer.on('capture-detected', callback);
  },
  
  onGlobalTypingActivate: (callback) => {
    ipcRenderer.on('activate-global-typing', callback);
  }
});
