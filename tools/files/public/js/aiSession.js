// ./js/aiSession.js

const DEFAULT_API_BASE = "https://gen.pollinations.ai/v1";
const DEFAULT_MODEL = "gemini-fast";
const DEFAULT_SYSTEM_PROMPT = "You are a helpful AI assistant.";
const DEFAULT_TEMPERATURE = 0.7;

/**
 * Headless AI session manager for Pollinations AI API
 * @example
 * import { AISession } from './modules/aiSession.js';
 * 
 * const session = new AISession({ apiKey: 'your-key' });
 * session.setSystemPrompt('You are a coding expert.');
 * 
 * // Streaming response
 * await session.sendMessage('How do I fetch data in JS?', {
 *   onToken: (token) => process.stdout.write(token)
 * });
 * 
 * // Get conversation history
 * console.log(session.getHistory());
 */
export class AISession {
  #apiKey;
  #baseURL;
  #model;
  #temperature;
  #messages;
  #systemPrompt;
  #abortController;

  /**
   * @param {Object} options
   * @param {string} options.apiKey - Pollinations AI API key
   * @param {string} [options.baseURL] - API base URL (default: pollinations endpoint)
   * @param {string} [options.model] - Default model ID (default: "openai")
   * @param {string} [options.systemPrompt] - Initial system prompt
   * @param {number} [options.temperature] - Sampling temperature 0-1 (default: 0.7)
   */
  constructor({ 
    apiKey, 
    baseURL = DEFAULT_API_BASE, 
    model = DEFAULT_MODEL,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    temperature = DEFAULT_TEMPERATURE 
  } = {}) {
    if (!apiKey) {
      throw new Error('AISession requires an apiKey');
    }
    
    this.#apiKey = apiKey;
    this.#baseURL = baseURL.replace(/\/+$/, ''); // trim trailing slashes
    this.#model = model;
    this.#temperature = this.#clamp(temperature, 0, 1);
    this.#systemPrompt = systemPrompt;
    this.#messages = [{ role: 'system', content: this.#systemPrompt }];
    this.#abortController = null;
  }

  // ===== Getters/Setters =====

  get apiKey() {
    return this.#apiKey;
  }

  set apiKey(key) {
    if (!key) throw new Error('API key cannot be empty');
    this.#apiKey = key;
  }

  get model() {
    return this.#model;
  }

  set model(modelId) {
    this.#model = modelId;
  }

  get temperature() {
    return this.#temperature;
  }

  set temperature(value) {
    this.#temperature = this.#clamp(value, 0, 1);
  }

  // ===== Session Management =====

  /**
   * Update the system prompt (resets conversation)
   * @param {string} prompt 
   */
  setSystemPrompt(prompt) {
    this.#systemPrompt = prompt;
    this.#messages = [{ role: 'system', content: prompt }];
  }

  /**
   * Get conversation history as JSON-serializable array
   * @param {'full'|'without-system'} [mode='full'] - Include/exclude system message
   * @returns {Array<{role: string, content: string}>}
   */
  getHistory(mode = 'full') {
    if (mode === 'without-system') {
      return this.#messages.filter(m => m.role !== 'system');
    }
    return [...this.#messages];
  }

  /**
   * Load history from external JSON (validates structure)
   * @param {Array} messages 
   * @param {boolean} preserveSystem - Keep existing system prompt or replace
   */
  loadHistory(messages, preserveSystem = true) {
    if (!Array.isArray(messages)) {
      throw new TypeError('History must be an array of message objects');
    }

    const validMessages = messages.filter(msg => 
      msg && typeof msg === 'object' && 
      ['user', 'assistant', 'system'].includes(msg.role) && 
      typeof msg.content === 'string'
    );

    if (preserveSystem) {
      // Keep current system prompt, append other messages
      this.#messages = [
        { role: 'system', content: this.#systemPrompt },
        ...validMessages.filter(m => m.role !== 'system')
      ];
    } else {
      // Replace entire history (must include system message or add default)
      const hasSystem = validMessages.some(m => m.role === 'system');
      this.#messages = hasSystem 
        ? validMessages 
        : [{ role: 'system', content: this.#systemPrompt }, ...validMessages];
    }
  }

  /**
   * Clear conversation history (keeps system prompt)
   */
  clearHistory() {
    this.#messages = [{ role: 'system', content: this.#systemPrompt }];
  }

  // ===== Core API Methods =====

  /**
   * Send a message and stream the response
   * @param {string} prompt - User message content
   * @param {Object} options
   * @param {function(string):void} [options.onToken] - Callback for each streamed token
   * @param {function(string):void} [options.onComplete] - Callback when response finishes
   * @param {function(Error):void} [options.onError] - Callback for errors
   * @param {string} [options.model] - Override default model for this request
   * @param {number} [options.temperature] - Override default temperature
   * @returns {Promise<string>} Full response content
   */
  async sendMessage(prompt, {
    onToken = null,
    onComplete = null,
    onError = null,
    model = this.#model,
    temperature = this.#temperature
  } = {}) {
    if (!prompt?.trim()) {
      throw new Error('Prompt cannot be empty');
    }

    // Abort any in-progress request
    this.abortRequest();
    this.#abortController = new AbortController();

    // Add user message to history
    this.#messages.push({ role: 'user', content: prompt });

    const payload = {
      model,
      messages: this.#messages,
      temperature: this.#clamp(temperature, 0, 1),
      stream: true
    };

    let fullResponse = '';
    const endpoint = `${this.#baseURL}/chat/completions`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.#apiKey}`
        },
        body: JSON.stringify(payload),
        signal: this.#abortController.signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || line.startsWith('event:') || line.startsWith('id:') || line.startsWith('retry:')) {
            continue;
          }

          if (line.startsWith('data: ')) {
            const data = line.substring(6).trim(); // "data: ".length = 6
            if (data === '[DONE]') break;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                if (typeof onToken === 'function') {
                  onToken(content);
                }
              }
            } catch (e) {
              // Skip malformed JSON chunks (common in streaming)
              continue;
            }
          }
        }
      }

      // Add assistant response to history
      this.#messages.push({ role: 'assistant', content: fullResponse });
      
      if (typeof onComplete === 'function') {
        onComplete(fullResponse);
      }
      
      return fullResponse;

    } catch (error) {
      // Remove the user message if request failed (optional behavior)
      if (this.#messages[this.#messages.length - 1]?.role === 'user') {
        this.#messages.pop();
      }
      
      if (error.name === 'AbortError') {
        console.debug('Request aborted');
        return '';
      }
      
      if (typeof onError === 'function') {
        onError(error);
      } else {
        console.error('AISession error:', error);
      }
      throw error;
      
    } finally {
      this.#abortController = null;
    }
  }

  /**
   * Abort any in-progress streaming request
   */
  abortRequest() {
    if (this.#abortController) {
      this.#abortController.abort();
      this.#abortController = null;
    }
  }

  /**
   * Export session state for persistence/transfer
   * @returns {Object} Serializable session data
   */
  exportSession() {
    return {
      model: this.#model,
      temperature: this.#temperature,
      systemPrompt: this.#systemPrompt,
      messages: this.#messages,
      baseURL: this.#baseURL,
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * Create a new session from exported data
   * @param {Object} data - From exportSession()
   * @param {string} apiKey - Required API key (not stored in export for security)
   * @returns {AISession}
   */
  static importSession(data, apiKey) {
    if (!data?.messages || !apiKey) {
      throw new Error('Valid session data and apiKey required');
    }
    
    const session = new AISession({
      apiKey,
      baseURL: data.baseURL,
      model: data.model,
      systemPrompt: data.systemPrompt,
      temperature: data.temperature
    });
    
    // Restore messages (importSession handles system message logic)
    session.loadHistory(data.messages, false);
    return session;
  }

  // ===== Utilities =====

  #clamp(value, min, max) {
    const num = parseFloat(value);
    if (isNaN(num)) return min;
    return Math.min(max, Math.max(min, num));
  }

  /**
   * Simple non-streaming convenience method
   * @param {string} prompt 
   * @param {Object} options - Same as sendMessage, minus streaming callbacks
   * @returns {Promise<string>} Full response
   */
  async ask(prompt, options = {}) {
    let response = '';
    await this.sendMessage(prompt, {
      ...options,
      onToken: (token) => { response += token; }
    });
    return response;
  }
}

// Re-export for convenience
export default AISession;