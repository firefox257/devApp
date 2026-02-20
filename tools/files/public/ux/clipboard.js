// ./ux/clipboard.js
/**
 * Shared Clipboard Module
 * Provides system clipboard access with IndexedDB fallback
 * Database: sharedStorage (v2) | Store: appData | Key prefix: clipboard:
 * 
 * Features:
 * - Namespaced keys to prevent module conflicts
 * - Automatic secure context detection
 * - Light DOM notice system
 * - Comprehensive error handling
 * - Tree-shakable exports
 */

const DB_NAME = 'sharedStorage';
const STORE_NAME = 'appData';
const KEY_PREFIX = 'clipboard:';
const NOTICE_ID = 'shared-clipboard-notice';
const DEFAULT_NOTICE_DURATION = 5000;

// ======================
// DATABASE OPERATIONS
// ======================

function openDB(mode = 'readonly') {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2); // Increment version for schema changes
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeInAppClipboard(text, namespace = 'default') {
  const db = await openDB('readwrite');
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await store.put(
      { value: text, timestamp: Date.now() },
      `${KEY_PREFIX}${namespace}`
    );
    return true;
  } finally {
    db.close();
  }
}

export async function readFromAppClipboard(namespace = 'default') {
  const db = await openDB();
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const record = await store.get(`${KEY_PREFIX}${namespace}`);
    return record?.value || null;
  } finally {
    db.close();
  }
}

export async function clearAppClipboard(namespace = 'default') {
  const db = await openDB('readwrite');
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await store.delete(`${KEY_PREFIX}${namespace}`);
  } finally {
    db.close();
  }
}

// ======================
// SYSTEM CLIPBOARD
// ======================

function isSecureContext() {
  return (
    location.protocol === 'https:' || 
    location.hostname === 'localhost' || 
    location.protocol === 'file:' ||
    location.hostname === '127.0.0.1'
  );
}

async function tryModernAPI(text) {
  if (!navigator.clipboard?.writeText || !isSecureContext()) return false;
  await navigator.clipboard.writeText(text);
  return true;
}

async function tryExecCommand(text) {
  if (!document.execCommand) return false;
  
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
  document.body.appendChild(textarea);
  
  try {
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}

// ======================
// UI UTILITIES
// ======================

function showFeedback(button, icon, duration = 1500) {
  if (!button) return;
  const original = button.textContent;
  button.textContent = icon;
  setTimeout(() => { 
    if (button.textContent === icon) button.textContent = original; 
  }, duration);
}

export function showNotice(message, duration = DEFAULT_NOTICE_DURATION) {
  // Reuse existing notice if visible
  let notice = document.getElementById(NOTICE_ID);
  if (notice) {
    notice.textContent = message;
    if (notice._timeout) clearTimeout(notice._timeout);
  } else {
    notice = document.createElement('div');
    notice.id = NOTICE_ID;
    notice.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #fff3cd;
      border: 1px solid #ffeaa7;
      color: #856404;
      padding: 10px 16px;
      border-radius: 6px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 0.9em;
      z-index: 2147483647; /* Max safe z-index */
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      max-width: 350px;
      line-height: 1.4;
      transition: opacity 0.3s;
    `;
    document.body.appendChild(notice);
  }
  
  notice.textContent = message;
  notice._timeout = setTimeout(() => {
    if (notice.parentNode) notice.parentNode.removeChild(notice);
  }, duration);
  
  return () => {
    if (notice.parentNode) notice.parentNode.removeChild(notice);
  };
}

// ======================
// MAIN COPY FUNCTION
// ======================

/**
 * Copy text with progressive enhancement
 * @param {string} text - Text to copy
 * @param {HTMLElement} [button] - Button element for visual feedback
 * @param {Object} [options] - { namespace: string, showNotice: boolean }
 * @returns {Promise<boolean>} Success status
 */
export async function copyText(text, button = null, options = {}) {
  if (typeof text !== 'string') {
    console.error('[Clipboard] Non-string content rejected:', typeof text);
    showFeedback(button, '❌');
    return false;
  }

  const { 
    namespace = 'default', 
    showNotice: showNoticeOpt = true 
  } = options;

  // Attempt 1: Modern Clipboard API
  try {
    if (await tryModernAPI(text)) {
      showFeedback(button, '✅');
      return true;
    }
  } catch (e) {
    console.warn('[Clipboard] Modern API failed:', e.message);
  }

  // Attempt 2: execCommand fallback
  try {
    if (await tryExecCommand(text)) {
      showFeedback(button, '✅');
      return true;
    }
  } catch (e) {
    console.warn('[Clipboard] execCommand failed:', e.message);
  }

  // Fallback: App clipboard storage
  try {
    await storeInAppClipboard(text, namespace);
    showFeedback(button, '💾');
    
    if (showNoticeOpt) {
      showNotice(
        `📋 Copied to app clipboard (${namespace})\n` +
        `Ctrl+V unavailable. Use paste function in "${namespace}" context.`,
        6000
      );
    }
    return true;
  } catch (e) {
    console.error('[Clipboard] All methods failed:', e);
    showFeedback(button, '❌');
    return false;
  }
}

// ======================
// BROWSER SUPPORT CHECK
// ======================

export const isClipboardSupported = !!(
  (navigator.clipboard && isSecureContext()) || 
  document.execCommand
);

// Optional: Auto-cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const notice = document.getElementById(NOTICE_ID);
    if (notice?.parentNode) notice.parentNode.removeChild(notice);
  });
}

// Usage examples in comments:
/*
// Basic copy with button feedback
import { copyText } from './clipboard.js';
copyText(code, copyButton);

// Namespaced clipboard (prevents conflicts between modules)
copyText(chatHistory, null, { namespace: 'ai-chat' });
pasteFromAppClipboard({ namespace: 'ai-chat' });

// Read app clipboard
const text = await readFromAppClipboard('ai-chat');

// Show custom notice
import { showNotice } from './clipboard.js';
const hide = showNotice('✨ Special message!', 3000);
setTimeout(hide, 1000); // Dismiss early if needed
*/