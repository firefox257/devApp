/**
 * RoomChatClient - Browser module for room-based WebSocket communication
 * WITH PRIVATE MESSAGING SUPPORT (VALIDATION-FIXED & RESPONSE-HANDLING CORRECTED)
 * 
 * @module RoomChatClient
 * @version 1.2.0
 */
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined'
    ? module.exports = factory()
    : typeof define === 'function' && define.amd
    ? define(factory)
    : (global.RoomChatClient = factory());
})(this, function () {
  'use strict';

  class RoomChatClient {
    constructor(url, options = {}) {
      this.url = url;
      this.ws = null;
      this.isConnected = false;
      this.connectionId = null;
      this.currentRooms = new Set();
      this.eventListeners = new Map();
      this.reconnectAttempts = 0;
      this.reconnectTimer = null;
      this.isClosing = false;

      this.options = {
        reconnectDelay: options.reconnectDelay || 3000,
        maxReconnectAttempts: options.maxReconnectAttempts || 5,
        autoReconnect: options.autoReconnect !== false,
        logger: options.logger || console
      };

      this._onOpen = this._onOpen.bind(this);
      this._onMessage = this._onMessage.bind(this);
      this._onClose = this._onClose.bind(this);
      this._onError = this._onError.bind(this);
    }

    connect() {
      return new Promise((resolve, reject) => {
        if (this.isConnected || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
          this.options.logger.warn('[RoomChatClient] Already connected');
          return resolve();
        }

        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          this.options.logger.warn('[RoomChatClient] Connection in progress');
          return reject(new Error('Connection already in progress'));
        }

        this.options.logger.log('[RoomChatClient] Connecting to', this.url);

        try {
          this.ws = new WebSocket(this.url);
          this.ws.onopen = (event) => this._onOpen(event, resolve, reject);
          this.ws.onmessage = this._onMessage;
          this.ws.onclose = this._onClose;
          this.ws.onerror = this._onError;
        } catch (error) {
          this.options.logger.error('[RoomChatClient] Connection error:', error);
          reject(error);
        }
      });
    }

    disconnect(code = 1000, reason = 'User initiated disconnect') {
      this.options.logger.log('[RoomChatClient] Disconnecting...');
      this.isClosing = true;
      this.clearReconnectTimer();

      if (this.ws) {
        try {
          // Only close if not already closing/closed
          if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
            this.ws.close(code, reason);
          }
        } catch (e) {
          this.options.logger.warn('[RoomChatClient] Error during disconnect:', e);
        }
        this.ws = null;
      }
      this.currentRooms.clear();
    }

    /**
     * Subscribe to a room - FIXED: Waits for server confirmation before resolving
     * @param {string} roomId - Room ID to subscribe to
     * @returns {Promise<void>}
     */
    subscribe(roomId) {
  return new Promise((resolve, reject) => {
    if (!this.isConnected) return reject(new Error('Not connected'));
    if (!roomId || !/^[a-zA-Z0-9_-]{1,50}$/.test(roomId)) {
      return reject(new Error('Invalid room ID'));
    }
    if (this.currentRooms.has(roomId)) {
      return reject(new Error(`Already subscribed to room "${roomId}"`));
    }
    
    // Set up listener BEFORE sending request
    const handler = (data) => {
      if (data.roomId === roomId) {
        this.off('room_joined', handler);
        this.off('error', errorHandler);
        resolve();
      }
    };
    
    const errorHandler = (err) => {
      if (err.message.includes(roomId) || err.message.includes('subscribe')) {
        this.off('room_joined', handler);
        this.off('error', errorHandler);
        reject(err);
      }
    };
    
    this.on('room_joined', handler);
    this.on('error', errorHandler);
    this._send({ action: 'subscribe', roomId });
  });
}

    /**
     * Unsubscribe from a room - FIXED: Waits for server confirmation before resolving
     * @param {string} roomId - Room ID to unsubscribe from
     * @returns {Promise<void>}
     */
    unsubscribe(roomId) {
  return new Promise((resolve, reject) => {
    if (!this.isConnected) return reject(new Error('Not connected'));
    if (!this.currentRooms.has(roomId)) {
      return reject(new Error(`Not subscribed to room "${roomId}"`));
    }
    
    const handler = (data) => {
      if (data.roomId === roomId) {
        this.off('room_left', handler);
        this.off('error', errorHandler);
        resolve();
      }
    };
    
    const errorHandler = (err) => {
      if (err.message.includes(roomId) || err.message.includes('unsubscribe')) {
        this.off('room_left', handler);
        this.off('error', errorHandler);
        reject(err);
      }
    };
    
    this.on('room_left', handler);
    this.on('error', errorHandler);
    this._send({ action: 'unsubscribe', roomId });
  });
}

    /**
     * Send message to room (broadcast) or specific user (private)
     * @param {string} roomId - Target room
     * @param {string} message - Message content
     * @param {string} [to] - Optional target user connectionId for private message
     */
    send(roomId, message, to = null) {
      return new Promise((resolve, reject) => {
        if (!this.isConnected) return reject(new Error('Not connected to server'));
        if (!this.currentRooms.has(roomId)) return reject(new Error(`Not subscribed to room "${roomId}"`));
        if (!this._isValidMessage(message)) return reject(new Error('Invalid message (1-10000 characters)'));

        // Validate private message target
        if (to !== null && to !== undefined) {
          const targetId = to.trim();
          if (!this._isValidUserId(targetId)) {
            return reject(new Error('Invalid target user ID (alphanumeric, underscores, hyphens, 1-50 chars)'));
          }
          if (targetId === this.connectionId) {
            return reject(new Error('Cannot send private message to yourself'));
          }
          to = targetId; // Use validated/trimmed value
        }

        const payload = { action: 'send', roomId, message };
        if (to) payload.to = to;

        const successEvent = to ? 'private_message_sent' : 'message_sent';
        const handler = (data) => {
          if (data.event === successEvent && data.roomId === roomId) {
            this.off('system', handler);
            this.off('error', errorHandler);
            this.options.logger.log(`[RoomChatClient] Message sent to ${roomId}${to ? ` (private to ${to})` : ''}`);
            resolve();
          }
        };

        const errorHandler = (err) => {
          if (err.message.includes(roomId) || err.message.includes('send')) {
            this.off('system', handler);
            this.off('error', errorHandler);
            reject(err);
          }
        };

        this.on('system', handler);
        this.on('error', errorHandler);
        this._send(payload);
      });
    }

    /**
     * List users in a room (FIXED: Uses dedicated event listener)
     * @param {string} roomId - Room ID
     * @returns {Promise<Array<{connectionId: string, joinedAt: string}>>}
     */
    listUsers(roomId) {
      return new Promise((resolve, reject) => {
        if (!this.isConnected) return reject(new Error('Not connected to server'));
        if (!this.currentRooms.has(roomId)) return reject(new Error(`Not subscribed to room "${roomId}"`));

        const handler = (data) => {
          if (data.roomId === roomId) {
            this.off('user_list', handler);
            this.off('error', errorHandler);
            resolve(data.users || []);
          }
        };

        const errorHandler = (err) => {
          if (err.message.includes(roomId) || err.message.includes('list_users')) {
            this.off('user_list', handler);
            this.off('error', errorHandler);
            reject(err);
          }
        };

        this.on('user_list', handler);
        this.on('error', errorHandler);
        this._send({ action: 'list_users', roomId });
      });
    }

    /**
     * List all available rooms (FIXED: Uses dedicated event listener)
     * @returns {Promise<Array<{roomId: string, memberCount: number}>>}
     */
    listRooms() {
      return new Promise((resolve, reject) => {
        if (!this.isConnected) return reject(new Error('Not connected to server'));

        const handler = (rooms) => {
          this.off('room_list', handler);
          this.off('error', errorHandler);
          resolve(rooms || []);
        };

        const errorHandler = (err) => {
          if (err.message.includes('list_rooms')) {
            this.off('room_list', handler);
            this.off('error', errorHandler);
            reject(err);
          }
        };

        this.on('room_list', handler);
        this.on('error', errorHandler);
        this._send({ action: 'list_rooms' });
      });
    }

    on(event, callback) {
      if (typeof callback !== 'function') throw new Error('Callback must be a function');
      if (!this.eventListeners.has(event)) this.eventListeners.set(event, new Set());
      this.eventListeners.get(event).add(callback);
      return () => {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
          listeners.delete(callback);
          if (listeners.size === 0) this.eventListeners.delete(event);
        }
      };
    }

    off(event, callback) {
      if (!callback) {
        this.eventListeners.delete(event);
        return;
      }
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) this.eventListeners.delete(event);
      }
    }

    getStatus() {
      return {
        isConnected: this.isConnected,
        connectionId: this.connectionId,
        currentRooms: Array.from(this.currentRooms),
        url: this.url,
        reconnectAttempts: this.reconnectAttempts
      };
    }

    getConnectionId() { return this.connectionId; }
    getSubscribedRooms() { return Array.from(this.currentRooms); }
    isSubscribed(roomId) { return this.currentRooms.has(roomId); }

    _attemptReconnect() {
      if (!this.options.autoReconnect || this.isClosing) return;
      this.reconnectAttempts++;
      if (this.reconnectAttempts > this.options.maxReconnectAttempts) {
        this.options.logger.error('[RoomChatClient] Max reconnection attempts reached');
        this._emit('error', new Error('Max reconnection attempts reached'));
        return;
      }
      this.options.logger.log(`[RoomChatClient] Reconnecting... (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`);
      this.clearReconnectTimer();
      this.reconnectTimer = setTimeout(() => {
        this.connect().catch((error) => {
          this.options.logger.error('[RoomChatClient] Reconnection failed:', error);
          this._attemptReconnect();
        });
      }, this.options.reconnectDelay);
    }

    clearReconnectTimer() {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    }

    _send(data) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this._emit('error', new Error('WebSocket not connected'));
        return;
      }
      try {
        this.ws.send(JSON.stringify(data));
      } catch (error) {
        this.options.logger.error('[RoomChatClient] Send error:', error);
        this._emit('error', error);
      }
    }

    _isValidRoomId(roomId) {
      return typeof roomId === 'string' && roomId.length > 0 && roomId.length <= 50 && /^[a-zA-Z0-9_-]+$/.test(roomId);
    }

    _isValidMessage(message) {
      return typeof message === 'string' && message.length > 0 && message.length <= 10000;
    }

    // [CRITICAL FIX] Match server validation EXACTLY for userId/connectionId
    _isValidUserId(userId) {
      return typeof userId === 'string' && 
             userId.length > 0 && 
             userId.length <= 50 && 
             /^[a-zA-Z0-9_-]+$/.test(userId); // Matches server's isValidUserId regex
    }

    _emit(event, data) {
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        listeners.forEach(callback => {
          try { 
            callback(data); 
          } catch (error) { 
            this.options.logger.error(`[RoomChatClient] Error in ${event} listener:`, error); 
          }
        });
      }
    }

    _onOpen(event, resolve, reject) {
      this.isConnected = true;
      this.isClosing = false;
      this.reconnectAttempts = 0;
      this.connectionId = null;
      this.currentRooms.clear();
      this.options.logger.log('[RoomChatClient] Connected successfully');
      this._emit('connected', { url: this.url });
      if (resolve) resolve();
    }

    _onMessage(event) {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case 'system': 
            this._handleSystemMessage(data); 
            break;
          case 'message': 
            this._emit('message', {
              roomId: data.roomId,
              from: data.from,
              content: data.content,
              timestamp: data.timestamp,
              isPrivate: false
            });
            break;
          case 'private_message':
            const pm = {
              roomId: data.roomId,
              from: data.from,
              to: data.to,
              content: data.content,
              timestamp: data.timestamp,
              isPrivate: true
            };
            this._emit('private_message', pm);
            this._emit('message', pm); // Unified handling path
            break;
          case 'room_list': 
            this._emit('room_list', data.rooms); 
            break;
          case 'user_list':
            this._emit('user_list', {
              roomId: data.roomId,
              users: data.users
            });
            break;
          case 'error': 
            // Emit as Error object with server message
            this._emit('error', new Error(data.message || 'Unknown server error')); 
            break;
          default: 
            this.options.logger.warn('[RoomChatClient] Unknown message type:', data.type);
        }
      } catch (error) {
        this.options.logger.error('[RoomChatClient] Message parse error:', error);
      }
    }

    _handleSystemMessage(data) {
      switch (data.event) {
        case 'welcome':
          this.connectionId = data.connectionId;
          this._emit('connected', { 
            connectionId: data.connectionId, 
            message: data.message,
            timestamp: data.timestamp
          });
          break;
        case 'subscribed':
          this.currentRooms.add(data.roomId);
          this._emit('room_joined', {
            roomId: data.roomId,
            roomSize: data.roomSize,
            members: data.members || [],
            message: data.message,
            timestamp: data.timestamp
          });
          break;
        case 'unsubscribed':
          this.currentRooms.delete(data.roomId);
          this._emit('room_left', { 
            roomId: data.roomId, 
            message: data.message,
            timestamp: data.timestamp 
          });
          break;
        case 'user_joined':
          this._emit('user_joined', {
            roomId: data.roomId,
            connectionId: data.connectionId,
            timestamp: data.timestamp
          });
          break;
        case 'user_left':
          this._emit('user_left', {
            roomId: data.roomId,
            connectionId: data.connectionId,
            timestamp: data.timestamp
          });
          break;
        case 'private_message_sent':
          this._emit('private_message_sent', {
            roomId: data.roomId,
            to: data.to,
            timestamp: data.timestamp
          });
          break;
        case 'message_sent':
          this._emit('message_sent', {
            roomId: data.roomId,
            recipients: data.recipients,
            timestamp: data.timestamp
          });
          break;
      }
      this._emit('system', data);
    }

    _onClose(event) {
      this.isConnected = false;
      // Cleanup reference to avoid memory leaks
      if (this.ws) {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws = null;
      }
      
      this.options.logger.log(`[RoomChatClient] Disconnected (Code: ${event.code}, Reason: ${event.reason || 'none'})`);
      this._emit('disconnected', { 
        code: event.code, 
        reason: event.reason, 
        wasClean: event.wasClean 
      });
      
      if (!this.isClosing && this.options.autoReconnect) {
        this._attemptReconnect();
      }
    }

    _onError(error) {
      // WebSocket errors don't always include useful info - log what we have
      this.options.logger.error('[RoomChatClient] WebSocket error:', error.message || error);
      // Don't emit here - server errors are handled in _onMessage
      // Network-level errors will trigger onClose
    }
  }

  RoomChatClient.createUrl = function(protocol = 'ws', host = window.location.host, path = '/ws/room') {
    // Handle protocol normalization (ws/wss)
    const normalizedProto = protocol.replace(/:\/\//, '');
    return `${normalizedProto}://${host}${path}`;
  };

  RoomChatClient.isSupported = function() {
    return typeof WebSocket !== 'undefined';
  };

  return RoomChatClient;
});