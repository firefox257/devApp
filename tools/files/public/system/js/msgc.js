// /system/js/msgc.js
// ============================================
// GLOBAL MESSAGE CENTER - Mediator Pattern
// Encapsulated via IIFE for scope hiding
// Version: 1.0.1
// ============================================

globalThis.$msgc = (function() {
  'use strict';

  // ==================== PRIVATE STATE ====================
  const _subs = Object.create(null); // Internal storage using null prototype for safety
  const _prioritySubs = Object.create(null); // Optional priority-based subscriptions

  // ==================== PUBLIC FUNCTION ====================
  function $msgc(id, ...args) {
    // Get handlers from regular subscriptions
    const handlers = _subs[id] || [];
    // Get handlers from priority subscriptions if available
    const priorityHandlers = _prioritySubs[id] || [];

    // Combine and sort by priority (higher number = higher priority)
    const allHandlers = [
      ...priorityHandlers.map(h => ({ priority: h.priority, callback: h.callback })),
      ...handlers.map(h => ({ priority: 0, callback: h }))
    ].sort((a, b) => b.priority - a.priority);

    const results = [];

    // Call all subscribers with provided arguments
    for (let i = 0; i < allHandlers.length; i++) {
      try {
        const result = allHandlers[i].callback(...args);
        results.push(result);
      } catch (error) {
        console.error(`Error in subscriber for message "${id}":`, error);
      }
    }

    return results;
  }

  // ==================== PUBLIC METHODS ====================

  /**
   * Subscribe a function to a message ID
   * @param {string} id - The message identifier
   * @param {Function} callback - Function to call when message is published
   * @returns {Function} Unsubscribe handler (optional convenience)
   */
  $msgc.subscribe = function(id, callback) {
    // Skip if already subscribed (prevent duplicates)
    if (_subs[id]) {
      if (_subs[id].indexOf(callback) > -1) {
        console.warn(`Callback already subscribed to "${id}"`);
        return () => {}; // Return no-op unsubscribe
      }
    } else {
      _subs[id] = [];
    }

    _subs[id].push(callback);

    // Return convenience unsubscribe function
    return () => $msgc.unsubscribe(id, callback);
  };

  /**
   * Subscribe with priority to a message ID (higher priority runs first)
   * @param {string} id - The message identifier
   * @param {Function} callback - Function to call when message is published
   * @param {number} priority - Higher numbers run first (default: 0)
   * @returns {Function} Unsubscribe handler
   */
  $msgc.subscribePriority = function(id, callback, priority = 0) {
    if (!_prioritySubs[id]) {
      _prioritySubs[id] = [];
    }

    const entry = { callback, priority };
    _prioritySubs[id].push(entry);

    return () => {
      const index = _prioritySubs[id].findIndex(e => e.callback === callback);
      if (index > -1) {
        _prioritySubs[id].splice(index, 1);
        if (_prioritySubs[id].length === 0) {
          delete _prioritySubs[id];
        }
      }
    };
  };

  /**
   * One-time subscription - automatically unsubscribes after first call
   * @param {string} id - The message identifier
   * @param {Function} callback - Function to call once
   * @returns {Function} Unsubscribe handler
   */
  $msgc.once = function(id, callback) {
    let executed = false;

    const wrapper = (...args) => {
      if (!executed) {
        executed = true;
        callback(...args);
        $msgc.unsubscribe(id, wrapper);
      }
    };

    return $msgc.subscribe(id, wrapper);
  };

  /**
   * Subscribe an async function to a message ID
   * @param {string} id - The message identifier
   * @param {Function} callback - Async function to call when message is published
   * @returns {Function} Unsubscribe handler
   */
  $msgc.subscribeAsync = function(id, callback) {
    return this.subscribe(id, (...args) => Promise.resolve(callback(...args)));
  };

  /**
   * Unsubscribe a specific function from a message ID
   * @param {string} id - The message identifier
   * @param {Function} callback - Function to remove
   */
  $msgc.unsubscribe = function(id, callback) {
    if (_subs[id]) {
      const index = _subs[id].indexOf(callback);
      if (index > -1) {
        _subs[id].splice(index, 1);
      }
    }

    // Also check priority subs
    if (_prioritySubs[id]) {
      const index = _prioritySubs[id].findIndex(e => e.callback === callback);
      if (index > -1) {
        _prioritySubs[id].splice(index, 1);
      }
    }

    // Clean up empty arrays
    if (_subs[id] && _subs[id].length === 0) {
      delete _subs[id];
    }
    if (_prioritySubs[id] && _prioritySubs[id].length === 0) {
      delete _prioritySubs[id];
    }
  };

  /**
   * Clear all subscriptions for a message ID
   * @param {string} id - The message identifier
   */
  $msgc.clear = function(id) {
    if (_subs[id]) {
      delete _subs[id];
    }
    if (_prioritySubs[id]) {
      delete _prioritySubs[id];
    }
  };

  /**
   * Clear all subscriptions across all message IDs
   */
  $msgc.clearAll = function() {
    _subs.constructor.prototype = Object.prototype; // Revert any changes
    Object.keys(_subs).length && (_subs = Object.create(null));
    Object.keys(_prioritySubs).length && (_prioritySubs = Object.create(null));
  };

  /**
   * Check if there are subscribers for a message ID
   * @param {string} id - The message identifier
   * @returns {boolean}
   */
  $msgc.hasSubscribers = function(id) {
    return (!!_subs[id] && _subs[id].length > 0) ||
           (!!_prioritySubs[id] && _prioritySubs[id].length > 0);
  };

  /**
   * Get count of subscribers for a message ID
   * @param {string} id - The message identifier
   * @returns {number} Subscriber count
   */
  $msgc.getCount = function(id) {
    return (_subs[id]?.length || 0) + (_prioritySubs[id]?.length || 0);
  };

  /**
   * Get all subscription IDs
   * @returns {string[]} Array of all message IDs that have subscribers
   */
  $msgc.getAllIds = function() {
    const ids = new Set();
    if (_subs) {
      Object.keys(_subs).forEach(key => ids.add(key));
    }
    if (_prioritySubs) {
      Object.keys(_prioritySubs).forEach(key => ids.add(key));
    }
    return Array.from(ids);
  };

  /**
   * Enable debug logging for all messages
   * @param {boolean} enabled - Whether to enable debug mode
   */
  $msgc.debug = function(enabled) {
    if (!enabled) return;

    const originalSubscribe = $msgc.subscribe.bind($msgc);
    const originalUnsubscribe = $msgc.unsubscribe.bind($msgc);
    const originalPublish = $msgc.toString().includes('function') ?
      globalThis.$msgc : function() { return []; };

    // Wrap publish to log
    const oldMsgc = globalThis.$msgc;
    const msgcFn = function(...args) {
      const id = args[0];
      console.group(`$msgc: ${id}`);
      console.log('Parameters:', args.slice(1));
      console.log('Subscriber count:', $msgc.getCount(id));
      const results = oldMsgc(...args);
      console.log('Results:', results);
      console.groupEnd();
      return results;
    };

    // Don't actually replace - just add a debug flag internally
    $msgc._debugMode = true;
  };

  /**
   * Get debug mode status
   * @returns {boolean}
   */
  $msgc.isDebugEnabled = function() {
    return !!this._debugMode;
  };

  // ==================== VERSION INFORMATION ====================
  $msgc.VERSION = '1.0.1';

  // ==================== RETURN ====================
  return $msgc;
})();

// Export for module systems (if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = globalThis.$msgc;
}