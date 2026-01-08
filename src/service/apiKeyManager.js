// src/service/apiKeyManager.js
class ApiKeyManager {
  constructor(apiKeysString) {
    // Parse comma-separated API keys from environment variable
    this.keys = apiKeysString
      .split(',')
      .map(key => key.trim())
      .filter(key => key.length > 0)
      .map(key => ({
        key: key,
        consecutiveErrors: 0,
        isBlocked: false,
        lastErrorTime: null,
        blockUntil: null
      }));

    this.currentIndex = 0;
    this.BLOCK_DURATION = 60 * 1000; // 1 minute block
    this.MAX_CONSECUTIVE_ERRORS = 3;
    
    if (this.keys.length === 0) {
      throw new Error('No API keys provided. Please add GEMINI_API_KEYS to your .env file');
    }

    console.log(`✅ Initialized ApiKeyManager with ${this.keys.length} API key(s)`);
  }

  getCurrentIndex() {
    return this.currentIndex;
  }

  getCurrentKey() {
    return this.keys[this.currentIndex]?.key;
  }

  getNextAvailableKey() {
    const now = Date.now();
    
    // First, unblock any keys whose block duration has expired
    this.keys.forEach(keyObj => {
      if (keyObj.isBlocked && keyObj.blockUntil && now >= keyObj.blockUntil) {
        console.log(`🔓 Unblocking API key ${this.keys.indexOf(keyObj) + 1}`);
        keyObj.isBlocked = false;
        keyObj.consecutiveErrors = 0;
        keyObj.blockUntil = null;
      }
    });

    // Find the first available (non-blocked) key
    for (let i = 0; i < this.keys.length; i++) {
      const keyIndex = (this.currentIndex + i) % this.keys.length;
      const keyObj = this.keys[keyIndex];
      
      if (!keyObj.isBlocked) {
        this.currentIndex = keyIndex;
        return keyObj.key;
      }
    }

    // All keys are blocked
    console.error('❌ All API keys are currently blocked');
    return null;
  }

  markKeyAsFailed(keyIndex, error) {
    const keyObj = this.keys[keyIndex];
    if (!keyObj) return;

    keyObj.consecutiveErrors++;
    keyObj.lastErrorTime = Date.now();

    const isRateLimitError = 
      error?.message?.includes('quota') || 
      error?.message?.includes('rate limit') ||
      error?.message?.includes('429') ||
      error?.message?.includes('RESOURCE_EXHAUSTED');

    console.log(`⚠️ API Key ${keyIndex + 1} failed (${keyObj.consecutiveErrors}/${this.MAX_CONSECUTIVE_ERRORS} errors)`);

    // Block the key if it has too many consecutive errors or is rate limited
    if (keyObj.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS || isRateLimitError) {
      keyObj.isBlocked = true;
      keyObj.blockUntil = Date.now() + this.BLOCK_DURATION;
      console.log(`🔒 API Key ${keyIndex + 1} blocked for ${this.BLOCK_DURATION / 1000} seconds`);
    }
  }

  markKeyAsSuccess() {
    const keyObj = this.keys[this.currentIndex];
    if (keyObj) {
      keyObj.consecutiveErrors = 0;
      keyObj.lastErrorTime = null;
    }
  }

  rotateKey() {
    // Move to the next key in rotation
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    console.log(`🔄 Rotated to API key ${this.currentIndex + 1}`);
  }

  getStatus() {
    return this.keys.map((keyObj, index) => ({
      index: index + 1,
      isBlocked: keyObj.isBlocked,
      consecutiveErrors: keyObj.consecutiveErrors,
      isCurrent: index === this.currentIndex,
      keyPreview: keyObj.key.substring(0, 10) + '...',
      blockUntil: keyObj.blockUntil ? new Date(keyObj.blockUntil).toISOString() : null
    }));
  }

  // Force unblock all keys (admin function)
  unblockAll() {
    this.keys.forEach(keyObj => {
      keyObj.isBlocked = false;
      keyObj.consecutiveErrors = 0;
      keyObj.blockUntil = null;
    });
    console.log('🔓 All API keys have been unblocked');
  }
}

module.exports = ApiKeyManager;