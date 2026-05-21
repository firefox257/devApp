
//do not remove
//. /system/js/WasiFsProxy.js
/**
 * Browser WASM Filesystem Proxy Client
 * Browser-compatible, dynamic URL, robust connection handling
 */
class WasiFsProxy {
  constructor(options = {}) {
    // Auto-detect URL like your working example
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const defaultPath = options.path || '/wasi/fs-proxy.ws.js';
    this.url = options.url || `${protocol}//${window.location.host}${defaultPath}`;
    
    this.ws = null;
    this.pending = new Map();
    this.nextId = 1;
    this.connected = false;
    this._connectQueue = [];
    
    // Optional callbacks
    this.onReady = options.onReady || null;
    this.onEvent = options.onEvent || null;
    this.onError = options.onError || null;
    
    this._connect();
  }

  _connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    
    this.ws = new WebSocket(this.url);
    
    this.ws.onopen = () => {
      this.connected = true;
      console.log('[WasiFsProxy] Connected to', this.url);
      
      // Flush queued requests
      while (this._connectQueue.length) {
        const resolve = this._connectQueue.shift();
        resolve();
      }
      
      if (this.onReady) this.onReady();
    };
    
    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        this._onMessage(msg);
      } catch (err) {
        console.error('[WasiFsProxy] Parse error:', err);
        if (this.onError) this.onError(err);
      }
    };
    
    this.ws.onerror = (err) => {
      console.error('[WasiFsProxy] WebSocket error:', err);
      this.connected = false;
      
      // Reject pending requests
      for (const [id, req] of this.pending) {
        clearTimeout(req.timeout);
        req.reject(new Error('WebSocket connection failed'));
      }
      this.pending.clear();
      
      if (this.onError) this.onError(err);
    };
    
    this.ws.onclose = (e) => {
      console.log('[WasiFsProxy] Closed', e.code, e.reason);
      this.connected = false;
      this.ws = null;
      
      // Optional: auto-reconnect logic here
    };
  }

  // Wait for connection with queueing (no race conditions)
  _waitForReady() {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this._connectQueue.push(resolve);
      // Timeout after 15s
      setTimeout(() => {
        const idx = this._connectQueue.indexOf(resolve);
        if (idx !== -1) {
          this._connectQueue.splice(idx, 1);
          reject(new Error('Connection timeout'));
        }
      }, 15000);
    });
  }

  _request(cmd, params = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        await this._waitForReady();
      } catch (err) {
        return reject(err);
      }
      
      const id = this.nextId++;
      this.pending.set(id, { 
        resolve, 
        reject, 
        timeout: setTimeout(() => {
          this.pending.delete(id);
          reject(new Error('FS request timeout'));
        }, 30000) 
      });
      
      try {
        this.ws.send(JSON.stringify({ id, cmd, ...params }));
      } catch (err) {
        clearTimeout(this.pending.get(id).timeout);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  _onMessage(msg) {
    const req = this.pending.get(msg.id);
    if (!req) {
      // Unsolicited server event
      if (this.onEvent) this.onEvent(msg);
      return;
    }
    clearTimeout(req.timeout);
    this.pending.delete(msg.id);
    msg.error ? req.reject(new Error(msg.error)) : req.resolve(msg.result);
  }

  // Browser-safe binary encoding
  _encodeBinary(data) {
    if (typeof data === 'string') {
      return btoa(unescape(encodeURIComponent(data)));
    }
    if (data instanceof ArrayBuffer) data = new Uint8Array(data);
    if (data instanceof Uint8Array) {
      let binary = '';
      for (let i = 0; i < data.byteLength; i++) {
        binary += String.fromCharCode(data[i]);
      }
      return btoa(binary);
    }
    return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  }

  _decodeBinary(b64, asUint8Array = true) {
    const binary = atob(b64);
    if (!asUint8Array) {
      return decodeURIComponent(escape(binary));
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // POSIX-like API
  async open(path, flags = 'r') { return await this._request('open', { path, flags }); }
  
  async read(fd, length = 65536, offset = 0) { 
    const res = await this._request('read', { fd, length, offset });
    return { ...res, data: this._decodeBinary(res.data, true) }; 
  }
  
  async write(fd, data, offset = 0) { 
    const b64 = this._encodeBinary(data);
    return await this._request('write', { fd, data: b64, offset }); 
  }
  
  async close(fd) { return await this._request('close', { fd }); }
  async mkdir(path) { return await this._request('mkdir', { path }); }
  async unlink(path) { return await this._request('unlink', { path }); }
  async readdir(path) { return (await this._request('readdir', { path })).entries || []; }
  async stat(path) { return await this._request('stat', { path }); }
  async rename(oldPath, newPath) { return await this._request('rename', { path: oldPath, newpath: newPath }); }
  
  // Utilities
  async readFile(path, encoding = 'utf-8') {
    const { fd } = await this.open(path, 'r');
    try {
      let content = '';
      let bytesRead;
      do {
        const chunk = await this.read(fd, 65536, content.length);
        bytesRead = chunk.bytesRead;
        if (bytesRead > 0) {
          content += new TextDecoder(encoding).decode(chunk.data);
        }
      } while (bytesRead === 65536);
      return content;
    } finally {
      await this.close(fd);
    }
  }
  
  async writeFile(path, content, encoding = 'utf-8') {
    const { fd } = await this.open(path, 'w');
    try {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(content);
      const CHUNK = 65536;
      for (let offset = 0; offset < bytes.length; offset += CHUNK) {
        const chunk = bytes.slice(offset, offset + CHUNK);
        await this.write(fd, chunk, offset);
      }
    } finally {
      await this.close(fd);
    }
  }
  
  // Manual reconnect
  reconnect() {
    if (this.ws) this.ws.close();
    this._connect();
  }
  
  // Check connection state
  isConnected() {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }
}