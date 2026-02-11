/**
 * WebRTC Browser Client Module
 * Works with HTTP long-polling signaling server
 * Features: 
 *   - Automatic role negotiation (offerer/answerer)
 *   - Non-trickle ICE (bundled candidates)
 *   - Data channels (binary chunks + JSON)
 *   - Media stream handling
 *   - Connection recovery
 *   - Type-safe events
 *   - ICE gathering timeout (prevents hangs)
 *   - ICE candidate diagnostics (NEW)
 */
export default class WebRTCClient extends EventTarget {
  constructor(config = {}) {
    super();
    this.roomId = null;
    this.pc = null;
    this.dataChannel = null;
    this.localStream = null;
    this.remoteStream = null;
    this.isOfferer = false;
    this.isConnected = false;
    this.messageQueue = [];
    this.signalingUrl = config.signalingUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    this.iceServers = config.iceServers || [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];
    this.connectionTimeout = config.timeout || 30000;
    this.iceGatheringTimeout = config.iceGatheringTimeout || 15000; // Prevent ICE hangs
    this.debug = config.debug || false;
    this._log('WebRTC Client initialized');
  }

  _log(...args) {
    if (this.debug) console.log('[WebRTC]', ...args);
  }

  _error(...args) {
    console.error('[WebRTC]', ...args);
    this.dispatchEvent(new CustomEvent('error', { detail: args.join(' ') }));
  }

  /**
   * Initialize connection to room
   * @param {string} roomId - Unique room identifier
   * @param {Object} options
   * @param {boolean} options.isOfferer - Force role (optional)
   * @param {MediaStream} options.stream - Local media stream to share
   * @param {boolean} options.enableData - Enable data channel (default: true)
   * @returns {Promise<void>}
   */
  async init(roomId, options = {}) {
    if (this.pc) {
      this._error('Already connected. Call close() first.');
      throw new Error('ALREADY_CONNECTED');
    }

    this.roomId = roomId;
    this.localStream = options.stream || null;
    const enableData = options.enableData !== false;

    if (options.isOfferer !== undefined) {
      this.isOfferer = options.isOfferer;
      this._log(`Role explicitly set to ${this.isOfferer ? 'OFFERER' : 'ANSWERER'}`);
    } else {
      this.isOfferer = await this._checkRoomAvailability();
      this._log(`Auto-detected role: ${this.isOfferer ? 'OFFERER' : 'ANSWERER'}`);
    }
    
    this._log(`Initializing in room: ${roomId}`);
    
    this.pc = new RTCPeerConnection({ 
      iceServers: this.iceServers,
      bundlePolicy: 'max-compat',
      iceCandidatePoolSize: 0
    });

    this._setupConnectionHandlers(enableData);
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.pc.addTrack(track, this.localStream);
        this._log('Added local track:', track.kind);
      });
    }

    try {
      if (this.isOfferer) {
        await this._createOffer(enableData);
      } else {
        await this._waitForOffer(enableData);
      }
      this._log('Signaling completed successfully');
    } catch (err) {
      this._error('Signaling failed:', err.message);
      this.close();
      throw err;
    }
  }

  _setupConnectionHandlers(enableData) {
    this.pc.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      this._log('Remote stream received:', this.remoteStream.getTracks().length, 'tracks');
      this.dispatchEvent(new CustomEvent('stream', { detail: this.remoteStream }));
    };

    if (enableData) {
      if (this.isOfferer) {
        this.dataChannel = this.pc.createDataChannel('app-data', {
          ordered: true,
          maxRetransmits: 30
        });
        this._setupDataChannel(this.dataChannel);
      } else {
        this.pc.ondatachannel = (event) => {
          this.dataChannel = event.channel;
          this._setupDataChannel(this.dataChannel);
        };
      }
    }

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      this._log('Connection state changed:', state);
      
      // Dispatch detailed state change event for UI
      this.dispatchEvent(new CustomEvent('connectionstatechange', { 
        detail: { 
          state, 
          iceState: this.pc.iceConnectionState,
          signalingState: this.pc.signalingState
        } 
      }));
      
      switch (state) {
        case 'connected':
          this.isConnected = true;
          this.dispatchEvent(new Event('connect'));
          while (this.messageQueue.length && this.dataChannel?.readyState === 'open') {
            this.dataChannel.send(this.messageQueue.shift());
          }
          break;
        case 'failed':
          this._handleConnectionFailure('ICE negotiation failed');
          break;
        case 'disconnected':
          this.dispatchEvent(new Event('disconnect'));
          break;
        case 'closed':
          this._log('Peer connection closed');
          break;
      }
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate === null) {
        this._log('ICE gathering complete');
      }
    };
  }

  _setupDataChannel(channel) {
    channel.onopen = () => {
      this._log('Data channel opened');
      this.dispatchEvent(new Event('datachannelopen'));
    };

    channel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const json = JSON.parse(event.data);
          this.dispatchEvent(new CustomEvent('json', { detail: json }));
          return;
        } catch {
          this.dispatchEvent(new CustomEvent('data', { detail: event.data }));
        }
      } else if (event.data instanceof ArrayBuffer) {
        this.dispatchEvent(new CustomEvent('chunk', { detail: event.data }));
      } else {
        this.dispatchEvent(new CustomEvent('data', { detail: event.data }));
      }
    };

    channel.onerror = (err) => {
      this._error('Data channel error:', err);
    };

    channel.onclose = () => {
      this._log('Data channel closed');
      if (this.isConnected) {
        this._handleConnectionFailure('Data channel closed');
      }
    };
  }

  async _checkRoomAvailability() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);
      
      const res = await fetch(
        `${this.signalingUrl}/webrtc/wait?roomId=${encodeURIComponent(this.roomId)}`,
        { signal: controller.signal, method: 'GET' }
      );
      
      clearTimeout(timeoutId);
      
      if (res.status === 200) {
        return false;
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        this._error('Room check failed:', err);
      }
    }
    return true;
  }

  async _createOffer(enableData) {
    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    await this.pc.setLocalDescription(offer);
    await this._waitForIceGathering();
    await this._sendSignalingMessage(this.pc.localDescription);
    const answer = await this._waitForSignalingMessage();
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async _waitForOffer(enableData) {
    const offer = await this._waitForSignalingMessage();
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this._waitForIceGathering();
    await this._sendSignalingMessage(this.pc.localDescription);
  }

  _waitForIceGathering() {
    return new Promise((resolve, reject) => {
      if (this.pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      
      // CRITICAL: Timeout prevents indefinite hangs during ICE gathering
      const timeout = setTimeout(() => {
        this._log('ICE gathering timeout - proceeding with available candidates');
        this.pc.removeEventListener('icegatheringstatechange', checkState);
        resolve();
      }, this.iceGatheringTimeout);

      const checkState = () => {
        if (this.pc.iceGatheringState === 'complete') {
          clearTimeout(timeout);
          this.pc.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };
      
      this.pc.addEventListener('icegatheringstatechange', checkState);
    });
  }

  async _sendSignalingMessage(message) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.connectionTimeout);
    
    try {
      const res = await fetch(`${this.signalingUrl}/webrtc/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: this.roomId, message }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Signaling send failed (${res.status}): ${text}`);
      }
      
      this._log('Signaling message sent');
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('SIGNALLING_TIMEOUT');
      }
      throw err;
    }
  }

  async _waitForSignalingMessage() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.connectionTimeout + 2000);
    
    try {
      const res = await fetch(
        `${this.signalingUrl}/webrtc/wait?roomId=${encodeURIComponent(this.roomId)}`,
        { signal: controller.signal, method: 'GET' }
      );
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        if (res.status === 408) throw new Error('SIGNALLING_TIMEOUT');
        if (res.status === 409) throw new Error('ROOM_CONFLICT');
        if (res.status === 410) throw new Error('ROOM_EXPIRED');
        throw new Error(`Signaling wait failed (${res.status})`);
      }
      
      const data = await res.json();
      this._log('Signaling message received');
      return data.message;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('WAIT_TIMEOUT');
      }
      throw err;
    }
  }

  _handleConnectionFailure(reason = 'Connection lost') {
    if (this.isConnected) {
      this.isConnected = false;
      this.dispatchEvent(new CustomEvent('disconnect', { detail: { reason } }));
    }
    this._log('Connection failure:', reason);
  }

  send(data) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      if (this.isConnected) {
        this.messageQueue.push(data);
        this._log('Message queued (channel not ready)');
      } else {
        this._error('Cannot send: Not connected');
        throw new Error('NOT_CONNECTED');
      }
      return;
    }
    
    try {
      this.dataChannel.send(data);
      this._log('Data sent:', typeof data === 'string' ? data.substring(0, 50) : `${data.byteLength} bytes`);
    } catch (err) {
      this._error('Send failed:', err.message);
      throw err;
    }
  }

  sendJSON(obj) {
    if (typeof obj !== 'object' || obj === null) {
      throw new Error('sendJSON requires an object parameter');
    }
    this.send(JSON.stringify(obj));
  }

  sendChunk(buffer) {
    if (!(buffer instanceof ArrayBuffer)) {
      throw new Error('sendChunk requires ArrayBuffer parameter');
    }
    this.send(buffer);
  }

  addStream(stream) {
    if (!this.pc || this.pc.signalingState !== 'stable') {
      throw new Error('Cannot add stream: Connection not stable');
    }
    
    stream.getTracks().forEach(track => {
      if (!this.pc.getSenders().some(s => s.track?.id === track.id)) {
        this.pc.addTrack(track, stream);
        this._log('Added track:', track.kind);
      }
    });
    
    this.localStream = stream;
    this.dispatchEvent(new CustomEvent('localstream', { detail: stream }));
  }

  replaceStream(newStream) {
    const senders = this.pc.getSenders();
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        const sender = senders.find(s => s.track?.id === track.id);
        if (sender) this.pc.removeTrack(sender);
      });
    }
    
    newStream.getTracks().forEach(track => {
      const sender = senders.find(s => s.track?.kind === track.kind);
      if (sender && sender.track) {
        sender.replaceTrack(track).catch(err => this._error('Track replace failed:', err));
      } else {
        this.pc.addTrack(track, newStream);
      }
    });
    
    this.localStream = newStream;
    this.dispatchEvent(new CustomEvent('localstream', { detail: newStream }));
    this._log('Stream replaced');
  }

  async getStats() {
    if (!this.pc) return null;
    const stats = await this.pc.getStats();
    const report = {
      connectionState: this.pc.connectionState,
      iceConnectionState: this.pc.iceConnectionState,
      signalingState: this.pc.signalingState,
      dataChannelState: this.dataChannel?.readyState || 'none',
      localCandidates: [],
      remoteCandidates: [],
      bytesReceived: 0,
      bytesSent: 0
    };
    
    stats.forEach(stat => {
      if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
        report.nominatedCandidatePair = stat;
      }
      if (stat.type === 'inbound-rtp') {
        report.bytesReceived += stat.bytesReceived || 0;
      }
      if (stat.type === 'outbound-rtp') {
        report.bytesSent += stat.bytesSent || 0;
      }
      if (stat.type === 'local-candidate') {
        report.localCandidates.push(stat);
      }
      if (stat.type === 'remote-candidate') {
        report.remoteCandidates.push(stat);
      }
    });
    
    return report;
  }

  // ===== NEW: ICE CANDIDATE DIAGNOSTICS =====
  async getIceCandidates() {
    if (!this.pc) return { local: [], remote: [] };
    
    const stats = await this.pc.getStats();
    const localCandidates = [];
    const remoteCandidates = [];
    
    stats.forEach(stat => {
      if (stat.type === 'local-candidate') {
        localCandidates.push({
          id: stat.id,
          type: stat.candidateType,
          ip: stat.address,
          port: stat.port,
          protocol: stat.protocol,
          url: stat.url || 'local'
        });
      }
      if (stat.type === 'remote-candidate') {
        remoteCandidates.push({
          id: stat.id,
          type: stat.candidateType,
          ip: stat.address,
          port: stat.port,
          protocol: stat.protocol,
          url: stat.url || 'remote'
        });
      }
    });
    
    return { local: localCandidates, remote: remoteCandidates };
  }

  close() {
    this._log('Closing connection...');
    
    if (this.dataChannel) {
      try { this.dataChannel.close(); } catch (e) {}
      this.dataChannel = null;
    }
    
    if (this.pc) {
      try { this.pc.close(); } catch (e) {}
      this.pc = null;
    }
    
    this.isConnected = false;
    this.messageQueue = [];
    this.localStream = null;
    this.remoteStream = null;
    
    this.dispatchEvent(new Event('close'));
    this._log('Connection closed');
  }

  static async createRoom(config = {}) {
    const roomId = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    const client = new WebRTCClient(config);
    await client.init(roomId, { ...config, isOfferer: true });
    return { client, roomId };
  }

  static async joinRoom(roomId, config = {}) {
    const client = new WebRTCClient(config);
    await client.init(roomId, { ...config, isOfferer: false });
    return client;
  }
}