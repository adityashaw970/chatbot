// ============= VIRTUAL KEYBOARD MAPPER =============

class VirtualKeyboard {
  constructor(textarea) {
    this.textarea = textarea;
    this.isActive = false;
    
    // uIOhook keycode to character mapping
    this.keyMap = {
      // Numbers
      2: '1', 3: '2', 4: '3', 5: '4', 6: '5',
      7: '6', 8: '7', 9: '8', 10: '9', 11: '0',
      
      // Letters (scancodes match QWERTY layout)
      16: 'q', 17: 'w', 18: 'e', 19: 'r', 20: 't',
      21: 'y', 22: 'u', 23: 'i', 24: 'o', 25: 'p',
      30: 'a', 31: 's', 32: 'd', 33: 'f', 34: 'g',
      35: 'h', 36: 'j', 37: 'k', 38: 'l',
      44: 'z', 45: 'x', 46: 'c', 47: 'v', 48: 'b',
      49: 'n', 50: 'm',
      
      // Symbols (unshifted)
      12: '-', 13: '=', 26: '[', 27: ']',
      39: ';', 40: "'", 41: '`', 43: '\\',
      51: ',', 52: '.', 53: '/',
      
      // Special keys
      57: ' ',  // Space
      14: 'Backspace',
      28: 'Enter',
      15: 'Tab',
      1: 'Escape'
    };
    
    // Shift + key mappings
    this.shiftMap = {
      2: '!', 3: '@', 4: '#', 5: '$', 6: '%',
      7: '^', 8: '&', 9: '*', 10: '(', 11: ')',
      12: '_', 13: '+', 26: '{', 27: '}',
      39: ':', 40: '"', 41: '~', 43: '|',
      51: '<', 52: '>', 53: '?'
    };
    
    this.setupListeners();
  }
  
  setupListeners() {
    // Listen for virtual key events from main process
    window.electronAPI.onVirtualKeydown((data) => {
      if (!this.isActive) return;
      this.handleKeyPress(data);
    });
  }
  
  handleKeyPress(data) {
    const { keycode, shiftKey, ctrlKey } = data;
    
    // Handle Ctrl shortcuts
    if (ctrlKey) {
      if (keycode === 30) { // Ctrl+A
        this.textarea.select();
        return;
      }
      if (keycode === 46) { // Ctrl+C
        document.execCommand('copy');
        return;
      }
      if (keycode === 47) { // Ctrl+V
        navigator.clipboard.readText().then(text => {
          this.insertText(text);
        });
        return;
      }
    }
    
    // Special keys
    if (keycode === 14) { // Backspace
      this.handleBackspace();
      return;
    }
    
    if (keycode === 28) { // Enter
      this.handleEnter();
      return;
    }
    
    if (keycode === 15) { // Tab
      this.insertText('    '); // 4 spaces
      return;
    }
    
    // Get character
    let char = this.keyMap[keycode];
    if (!char) return;
    
    // Apply shift for letters
    if (char.length === 1 && char.match(/[a-z]/)) {
      char = shiftKey ? char.toUpperCase() : char;
    }
    // Apply shift for symbols
    else if (shiftKey && this.shiftMap[keycode]) {
      char = this.shiftMap[keycode];
    }
    
    this.insertText(char);
  }
  
  insertText(text) {
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;
    const value = this.textarea.value;
    
    // Insert text at cursor position
    this.textarea.value = value.substring(0, start) + text + value.substring(end);
    
    // Update cursor position
    const newPos = start + text.length;
    this.textarea.setSelectionRange(newPos, newPos);
    
    // Trigger input event for any listeners
    this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
  
  handleBackspace() {
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;
    
    if (start !== end) {
      // Delete selection
      this.textarea.value = this.textarea.value.substring(0, start) + 
                           this.textarea.value.substring(end);
      this.textarea.setSelectionRange(start, start);
    } else if (start > 0) {
      // Delete one character
      this.textarea.value = this.textarea.value.substring(0, start - 1) + 
                           this.textarea.value.substring(start);
      this.textarea.setSelectionRange(start - 1, start - 1);
    }
    
    this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
  
  handleEnter() {
    // For chat, you might want to send message instead
    // For now, just insert newline
    this.insertText('\n');
    
    // OR trigger send button
    // document.querySelector('.send-btn')?.click();
  }
  
  enable() {
    this.isActive = true;
    window.electronAPI.setVirtualTyping(true);
    console.log('✅ Virtual keyboard ENABLED');
  }
  
  disable() {
    this.isActive = false;
    window.electronAPI.setVirtualTyping(false);
    console.log('⏸️ Virtual keyboard DISABLED');
  }
}

// ============= SETUP ON PAGE LOAD =============

document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('messageInput'); // Your textarea ID
  const inputArea = document.querySelector('.input-area'); // Container div
  
  if (!textarea) {
    console.error('❌ Textarea not found!');
    return;
  }
  
  const virtualKB = new VirtualKeyboard(textarea);
  
  // Enable typing when hovering over input area
  inputArea.addEventListener('mouseenter', () => {
    virtualKB.enable();
    textarea.style.outline = '2px solid #4CAF50'; // Visual feedback
  });
  
  inputArea.addEventListener('mouseleave', () => {
    virtualKB.disable();
    textarea.style.outline = 'none';
  });
  
  // Optional: Show indicator
  const indicator = document.createElement('div');
  indicator.id = 'typing-indicator';
  indicator.textContent = '⌨️ Typing Active';
  indicator.style.cssText = `
    position: absolute;
    top: 10px;
    right: 10px;
    background: #4CAF50;
    color: white;
    padding: 5px 10px;
    border-radius: 5px;
    font-size: 12px;
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
  `;
  document.body.appendChild(indicator);
  
  inputArea.addEventListener('mouseenter', () => {
    indicator.style.opacity = '1';
  });
  
  inputArea.addEventListener('mouseleave', () => {
    indicator.style.opacity = '0';
  });
});