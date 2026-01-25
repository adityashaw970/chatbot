const { contextBridge, ipcRenderer } = require('electron');

// security
window.addEventListener('DOMContentLoaded', () => {
  // Prevent right-click
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    return false;
  });
});

// Main API

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
  onOcrTrigger: (callback) => { ipcRenderer.on('trigger-ocr', callback); },
  
  onScreenshotTrigger: (callback) => { ipcRenderer.on('trigger-screenshot', callback);},
  
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
  },
  copyImageToClipboard: (imageDataUrl) => ipcRenderer.invoke('copy-image-to-clipboard', imageDataUrl),

  pasteToWebview: (webviewId) => ipcRenderer.invoke('paste-to-webview', webviewId),

  onTriggerWebviewPaste: (callback) => ipcRenderer.on('trigger-webview-paste', callback),

  getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),

  startContinuousTranscription: (config) => 
    ipcRenderer.send('start-continuous-transcription', config),

  stopContinuousTranscription: () => 
    ipcRenderer.send('stop-continuous-transcription'),

  onTranscriptionStarted: (callback) => 
    ipcRenderer.on('transcription-started', (_, data) => callback(data)),

  onTranscriptionStopped: (callback) => 
    ipcRenderer.on('transcription-stopped', (_, data) => callback(data)),
 setVirtualTyping: (enabled) => ipcRenderer.send('set-virtual-typing', enabled),
  onVirtualKeydown: (callback) => ipcRenderer.on('virtual-keydown', (_, data) => callback(data)),
  removeVirtualListeners: () => ipcRenderer.removeAllListeners('virtual-keydown'),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text)
});
