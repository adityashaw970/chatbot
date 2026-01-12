//preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  closeWindow: () => ipcRenderer.send('close-window'),
  
  minimizeToFolder: () => ipcRenderer.send('minimize-to-folder'),
  
  restoreFromFolder: () => ipcRenderer.send('restore-from-folder'),
  
  captureScreen: () => ipcRenderer.invoke('capture-screenshot'),
  
  captureFullPage: () => ipcRenderer.invoke('capture-full-page'),
  
  getAudioSources: () => ipcRenderer.invoke('get-audio-sources'),
  
  // NEW: OCR functionality
  extractTextFromImage: (imageData) => ipcRenderer.invoke('extract-text-from-image', imageData),

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
  }
});