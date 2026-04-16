// ./ux/aichat.js
const API_BASE_URL = "https://gen.pollinations.ai/v1";
const MODELS_URL = `${API_BASE_URL}/models`;
const CHAT_COMPLETIONS_URL = `${API_BASE_URL}/chat/completions`;

// Local Storage Keys
const LOCAL_STORAGE_API_KEY = 'aiChatAPIKey';
const LOCAL_STORAGE_MODELS_KEY = 'aiChatModels';
const LOCAL_STORAGE_SELECTED_MODEL_KEY = 'aiChatSelectedModel';
const LOCAL_STORAGE_SYSTEM_PROMPT_KEY = 'aiChatSystemPrompt';
const LOCAL_STORAGE_MESSAGES_KEY = 'aiChatMessages';
const LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY = 'aiChatSelectedSystemPromptTitle';
const LOCAL_STORAGE_SELECTED_CODE_FILTER_KEY = 'aiChatSelectedCodeFilter';

// 🎨 CSS Variable References (for fallbacks only - prefer CSS classes)
const THEME_VARS = {
  primary: 'var(--system-accent, #007bff)',
  secondary: 'var(--system-text, #333333)',
  destructive: 'var(--system-danger, #dc3545)',
  success: 'var(--system-success, #28a745)',
  warning: 'var(--system-warning, #ffc107)',
  ai: 'var(--system-info, #6f42c1)',
  white: 'var(--system-text-on-accent, #ffffff)',
  bg: 'var(--system-bg, #ffffff)',
  text: 'var(--system-text, #333333)',
  border: 'var(--system-border, #cccccc)',
  borderHover: 'var(--system-border-hover, #999999)',
  headerBg: 'var(--system-header-bg, #e8e8e8)',
  menuBg: 'var(--system-menu-bg, rgba(30,30,30,0.95))',
  shadow: 'var(--system-shadow, 0 4px 12px rgba(0,0,0,0.15))',
  radius: 'var(--system-radius, 8px)',
  radiusLg: 'var(--system-radius-lg, 16px)',
};

class AIChat extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.models = [];
    this.currentModel = "openai";
    this.systemPrompt = "You are a helpful AI assistant.";
    this.systemPrompts = {};
    this.currentSystemPromptTitle = "";
    this.onCloseCallback = null;
    this.chatTitle = null;
    this.codeFilter = 'all';
    this.availableCodeTypes = new Set();
    this.apiKey = '';
    this.currentStreamReader = null;
    this.messages = [];
    this._themeMessageHandler = null;
    this._applyThemeVariablesRAF = null;
    this.render();
  }

  async connectedCallback() {
    const cachedAPIKey = localStorage.getItem(LOCAL_STORAGE_API_KEY);
    if (cachedAPIKey) {
      this.apiKey = cachedAPIKey;
    }
    const cachedModel = localStorage.getItem(LOCAL_STORAGE_SELECTED_MODEL_KEY);
    if (cachedModel) {
      this.currentModel = cachedModel;
    }
    await this.fetchSystemPrompts();
    const systemInput = this.shadowRoot.getElementById('systemInput');
    const systemPromptSelect = this.shadowRoot.getElementById('systemPromptSelect');
    const cachedSystemPromptContent = localStorage.getItem(LOCAL_STORAGE_SYSTEM_PROMPT_KEY);
    if (cachedSystemPromptContent) {
      this.systemPrompt = cachedSystemPromptContent;
      const foundKey = Object.keys(this.systemPrompts).find(key => this.systemPrompts[key] === cachedSystemPromptContent);
      if (foundKey) {
        this.currentSystemPromptTitle = foundKey;
        if (systemPromptSelect) systemPromptSelect.value = this.currentSystemPromptTitle;
      } else {
        this.currentSystemPromptTitle = "custom";
        if (systemPromptSelect) systemPromptSelect.value = "custom";
      }
    } else {
      const cachedSystemPromptTitle = localStorage.getItem(LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY);
      if (cachedSystemPromptTitle && this.systemPrompts[cachedSystemPromptTitle]) {
        this.currentSystemPromptTitle = cachedSystemPromptTitle;
        this.systemPrompt = this.systemPrompts[this.currentSystemPromptTitle];
        if (systemPromptSelect) systemPromptSelect.value = cachedSystemPromptTitle;
      } else if (Object.keys(this.systemPrompts).length > 0) {
        const defaultTitle = Object.keys(this.systemPrompts)[0];
        this.currentSystemPromptTitle = defaultTitle;
        this.systemPrompt = this.systemPrompts[defaultTitle];
        if (systemPromptSelect) systemPromptSelect.value = defaultTitle;
        localStorage.setItem(LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY, defaultTitle);
        localStorage.setItem(LOCAL_STORAGE_SYSTEM_PROMPT_KEY, this.systemPrompt);
      }
    }
    if (systemInput) {
      systemInput.textContent = this.systemPrompt;
    }
    this.messages = [{ role: 'system', content: this.systemPrompt }];
    await this.fetchModels();
    this.setupEventListeners();
    this.applyDynamicProperties();
    this.updateTitleBar();
    this.shadowRoot.getElementById('modelSelect').value = this.currentModel;
    const cachedCodeFilter = localStorage.getItem(LOCAL_STORAGE_SELECTED_CODE_FILTER_KEY);
    if (cachedCodeFilter) {
      this.codeFilter = cachedCodeFilter;
    }
    this.populateCodeFilterDropdown();
    this.renderHistory();
    this.syncWithParentTheme();
  }

  disconnectedCallback() {
    if (this.onCloseCallback) {
      this.onCloseCallback();
    }
    this.stopAIChatResponse();
    if (this._themeMessageHandler) {
      window.removeEventListener('message', this._themeMessageHandler);
      this._themeMessageHandler = null;
    }
    if (this._applyThemeVariablesRAF) {
      cancelAnimationFrame(this._applyThemeVariablesRAF);
      this._applyThemeVariablesRAF = null;
    }
  }

  static get observedAttributes() {
    return ['title', 'onclose'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'title') {
      this.chatTitle = newValue;
      this.updateTitleBar();
    } else if (name === 'onclose') {
      try {
        this.onCloseCallback = window[newValue] || new Function(newValue);
      } catch (e) {
        console.error(`Error parsing onClose attribute: ${e}`);
        this.onCloseCallback = null;
      }
      this.updateCloseButtonVisibility();
    }
  }

  applyDynamicProperties() {
    if (this.hasAttribute('title')) {
      this.chatTitle = this.getAttribute('title');
    }
    if (this.hasAttribute('onclose')) {
      try {
        this.onCloseCallback = window[this.getAttribute('onclose')] || new Function(this.getAttribute('onclose'));
      } catch (e) {
        console.error(`Error parsing onClose attribute: ${e}`);
        this.onCloseCallback = null;
      }
    }
    this.updateCloseButtonVisibility();
  }

  syncWithParentTheme() {
    try {
      if (window.parent && window.parent !== window) {
        const trustedOrigin = window.location.origin;
        window.parent.postMessage({ type: 'os-theme-sync-request', source: 'ai-chat' }, trustedOrigin);
        this._themeMessageHandler = (event) => {
          if (event.origin !== trustedOrigin) return;
          if (event.data?.type === 'os-theme-update' && event.data?.variables) {
            this.applyThemeVariables(event.data.variables);
          }
        };
        window.addEventListener('message', this._themeMessageHandler);
      }
    } catch (e) {
      console.warn('Theme sync with parent failed:', e);
    }
  }

  applyThemeVariables(variables) {
    if (this._applyThemeVariablesRAF) {
      cancelAnimationFrame(this._applyThemeVariablesRAF);
    }
    this._applyThemeVariablesRAF = requestAnimationFrame(() => {
      const root = this.shadowRoot;
      Object.entries(variables).forEach(([key, value]) => {
        if (key.startsWith('--system-')) {
          root.host?.style.setProperty(key, value);
        }
      });
      this._applyThemeVariablesRAF = null;
    });
  }

  updateTitleBar() {
    const titleBar = this.shadowRoot.querySelector('.title-bar');
    const titleSpan = this.shadowRoot.querySelector('.title-text');
    if (titleBar && titleSpan) {
      if (this.chatTitle) {
        titleSpan.textContent = this.chatTitle;
        titleBar.style.display = 'flex';
      } else {
        titleBar.style.display = 'none';
      }
    }
  }

  updateCloseButtonVisibility() {
    const closeButton = this.shadowRoot.getElementById('closeButton');
    if (closeButton) {
      closeButton.style.display = this.onCloseCallback ? 'block' : 'none';
    }
  }

  async fetchModels() {
    const cachedModels = localStorage.getItem(LOCAL_STORAGE_MODELS_KEY);
    if (cachedModels) {
      try {
        this.models = JSON.parse(cachedModels);
        this.populateModelDropdown();
        const isCachedModelAvailable = this.models.some(model => model.id === this.currentModel);
        if (!isCachedModelAvailable && this.models.length > 0) {
          this.currentModel = this.models[0].id;
          localStorage.setItem(LOCAL_STORAGE_SELECTED_MODEL_KEY, this.currentModel);
        }
      } catch (e) {
        localStorage.removeItem(LOCAL_STORAGE_MODELS_KEY);
      }
    }
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
      const response = await fetch(MODELS_URL, { headers });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      let modelsArray;
      if (Array.isArray(data)) {
        modelsArray = data;
      } else if (data && Array.isArray(data.data)) {
        modelsArray = data.data;
      } else {
        modelsArray = [];
      }
      this.models = modelsArray.map(model => ({
        id: model.id || model.name,
        name: model.name || model.id,
        description: model.description || model.name || model.id
      }));
      this.populateModelDropdown();
      localStorage.setItem(LOCAL_STORAGE_MODELS_KEY, JSON.stringify(this.models));
      const isCurrentModelAvailable = this.models.some(model => model.id === this.currentModel);
      if (!isCurrentModelAvailable && this.models.length > 0) {
        this.currentModel = this.models[0].id;
        localStorage.setItem(LOCAL_STORAGE_SELECTED_MODEL_KEY, this.currentModel);
      }
    } catch (error) {
      const modelSelect = this.shadowRoot.getElementById('modelSelect');
      if (modelSelect) {
        modelSelect.innerHTML = `<option value="">Error loading models</option>`;
      }
    }
  }

  populateModelDropdown() {
    const modelSelect = this.shadowRoot.getElementById('modelSelect');
    if (!modelSelect) return;
    modelSelect.innerHTML = '';
    this.models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.description || model.name || model.id;
      modelSelect.appendChild(option);
    });
    modelSelect.value = this.currentModel;
  }

  async fetchSystemPrompts() {
    const fileName = 'systemPrompts.json';
    try {
      const response = await fetch(fileName);
      if (!response.ok) {
        this.systemPrompts = {};
        return;
      }
      this.systemPrompts = await response.json();
      this.populateSystemPromptDropdown();
    } catch (error) {
      this.systemPrompts = {};
    }
  }

  populateSystemPromptDropdown() {
    const systemPromptSelect = this.shadowRoot.getElementById('systemPromptSelect');
    if (!systemPromptSelect) return;
    systemPromptSelect.innerHTML = '';
    const customOption = document.createElement('option');
    customOption.value = "custom";
    customOption.textContent = "Custom";
    systemPromptSelect.appendChild(customOption);
    for (const title in this.systemPrompts) {
      const option = document.createElement('option');
      option.value = title;
      option.textContent = title;
      systemPromptSelect.appendChild(option);
    }
    if (this.currentSystemPromptTitle && systemPromptSelect.querySelector(`option[value="${this.currentSystemPromptTitle}"]`)) {
      systemPromptSelect.value = this.currentSystemPromptTitle;
    } else {
      systemPromptSelect.value = "custom";
    }
  }

  stripHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || "";
  }

  clearConversation() {
    this.messages = [{ role: 'system', content: this.systemPrompt }];
    localStorage.removeItem(LOCAL_STORAGE_MESSAGES_KEY);
    this.availableCodeTypes.clear();
    this.codeFilter = 'all';
    localStorage.setItem(LOCAL_STORAGE_SELECTED_CODE_FILTER_KEY, this.codeFilter);
    this.populateCodeFilterDropdown();
    this.renderHistory();
    this.stopAIChatResponse();
  }

  stopAIChatResponse() {
    if (this.currentStreamReader) {
      try {
        this.currentStreamReader.cancel();
      } catch (e) {
      } finally {
        this.currentStreamReader = null;
      }
    }
  }

  setupEventListeners() {
    const sendButton = this.shadowRoot.getElementById('sendButton');
    const modelSelect = this.shadowRoot.getElementById('modelSelect');
    const systemPromptButton = this.shadowRoot.getElementById('systemPromptButton');
    const clearChatButton = this.shadowRoot.getElementById('clearChatButton');
    const systemPromptSelect = this.shadowRoot.getElementById('systemPromptSelect');
    const closeButton = this.shadowRoot.getElementById('closeButton');
    const systemInputContainer = this.shadowRoot.getElementById('systemInputContainer');
    const systemInput = this.shadowRoot.getElementById('systemInput');
    const textInputDiv = this.shadowRoot.getElementById('textInput');
    const apiKeyInput = this.shadowRoot.getElementById('apiKeyInput');
    const codeFilterSelect = this.shadowRoot.getElementById('codeFilterSelect');
    const copyConversationButton = this.shadowRoot.getElementById('copyConversationButton');
    const pasteConversationButton = this.shadowRoot.getElementById('pasteConversationButton');
    const resetSettingsButton = this.shadowRoot.getElementById('resetSettingsButton');

    if (sendButton) sendButton.addEventListener('click', () => this.sendMessage());
    if (modelSelect) {
      modelSelect.addEventListener('change', (event) => {
        this.currentModel = event.target.value;
        localStorage.setItem(LOCAL_STORAGE_SELECTED_MODEL_KEY, this.currentModel);
      });
    }
    if (systemPromptButton) systemPromptButton.addEventListener('click', () => {
      systemInputContainer.style.display = systemInputContainer.style.display === 'none' ? 'block' : 'none';
    });
    if (clearChatButton) clearChatButton.addEventListener('click', () => this.clearConversation());
    if (apiKeyInput) {
      apiKeyInput.addEventListener('input', (event) => {
        this.apiKey = event.target.value.trim();
        localStorage.setItem(LOCAL_STORAGE_API_KEY, this.apiKey);
      });
    }
    if (systemPromptSelect) {
      systemPromptSelect.addEventListener('change', (event) => {
        const selectedTitle = event.target.value;
        const systemInput = this.shadowRoot.getElementById('systemInput');
        if (selectedTitle === "custom") {
          systemInput.textContent = this.systemPrompt;
          this.currentSystemPromptTitle = "custom";
        } else if (this.systemPrompts[selectedTitle]) {
          this.systemPrompt = this.systemPrompts[selectedTitle];
          this.currentSystemPromptTitle = selectedTitle;
          systemInput.textContent = this.systemPrompt;
        }
        localStorage.setItem(LOCAL_STORAGE_SYSTEM_PROMPT_KEY, this.systemPrompt);
        localStorage.setItem(LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY, this.currentSystemPromptTitle);
        if (this.messages.length > 0 && this.messages[0].role === 'system') {
          this.messages[0].content = this.systemPrompt;
        } else {
          this.messages.unshift({ role: 'system', content: this.systemPrompt });
        }
      });
    }
    if (systemInput) {
      systemInput.addEventListener('input', (event) => {
        this.systemPrompt = this.stripHtml(event.target.innerHTML).trim();
        localStorage.setItem(LOCAL_STORAGE_SYSTEM_PROMPT_KEY, this.systemPrompt);
        const currentDropdownValue = systemPromptSelect ? systemPromptSelect.value : "";
        if (systemInput.textContent.trim() !== "" &&
            (currentDropdownValue === "" ||
                (this.systemPrompts[currentDropdownValue] !== systemInput.textContent.trim()))) {
          this.currentSystemPromptTitle = "custom";
          if (systemPromptSelect) systemPromptSelect.value = "custom";
          localStorage.setItem(LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY, "custom");
        }
        if (this.messages.length > 0 && this.messages[0].role === 'system') {
          this.messages[0].content = this.systemPrompt;
        } else {
          this.messages.unshift({ role: 'system', content: this.systemPrompt });
        }
      });
    }
    if (textInputDiv) {
      textInputDiv.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          this.sendMessage();
        }
      });
    }
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        if (this.onCloseCallback) {
          this.onCloseCallback();
        }
        this.remove();
      });
    }
    if (codeFilterSelect) {
      codeFilterSelect.addEventListener('change', (event) => {
        this.codeFilter = event.target.value;
        localStorage.setItem(LOCAL_STORAGE_SELECTED_CODE_FILTER_KEY, this.codeFilter);
        this.renderHistory();
      });
    }
    if (copyConversationButton) {
      copyConversationButton.addEventListener('click', () => this.copyConversation());
    }
    if (pasteConversationButton) {
      pasteConversationButton.addEventListener('click', () => this.pasteConversation());
    }
    if (resetSettingsButton) {
      resetSettingsButton.addEventListener('click', async () => {
        localStorage.removeItem(LOCAL_STORAGE_MODELS_KEY);
        localStorage.removeItem(LOCAL_STORAGE_SELECTED_MODEL_KEY);
        localStorage.removeItem(LOCAL_STORAGE_SYSTEM_PROMPT_KEY);
        localStorage.removeItem(LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY);

        await this.fetchModels();
        await this.fetchSystemPrompts();

        const modelSelect = this.shadowRoot.getElementById('modelSelect');
        if (this.models.length > 0) {
          this.currentModel = this.models[0].id;
          localStorage.setItem(LOCAL_STORAGE_SELECTED_MODEL_KEY, this.currentModel);
          modelSelect.value = this.currentModel;
        }

        const systemPromptSelect = this.shadowRoot.getElementById('systemPromptSelect');
        if (Object.keys(this.systemPrompts).length > 0) {
          const defaultTitle = Object.keys(this.systemPrompts)[0];
          this.currentSystemPromptTitle = defaultTitle;
          this.systemPrompt = this.systemPrompts[defaultTitle];
          systemPromptSelect.value = defaultTitle;
          localStorage.setItem(LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY, defaultTitle);
          localStorage.setItem(LOCAL_STORAGE_SYSTEM_PROMPT_KEY, this.systemPrompt);
        } else {
          this.currentSystemPromptTitle = "custom";
          this.systemPrompt = "You are a helpful AI assistant.";
          systemPromptSelect.value = "custom";
          localStorage.setItem(LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY, "custom");
          localStorage.setItem(LOCAL_STORAGE_SYSTEM_PROMPT_KEY, this.systemPrompt);
        }
        const systemInput = this.shadowRoot.getElementById('systemInput');
        if (systemInput) {
          systemInput.textContent = this.systemPrompt;
        }

        const resetButton = this.shadowRoot.getElementById('resetSettingsButton');
        if (resetButton) {
          const icon = resetButton.querySelector('.material-icon');
          if (icon) {
            const original = icon.textContent;
            icon.textContent = 'check';
            icon.className = 'material-icon icon--success';
            setTimeout(() => {
              icon.textContent = original;
              icon.className = 'material-icon icon--secondary';
            }, 1500);
          }
        }
      });
    }
  }

  async copyConversation() {
    try {
      const conversationData = {
        messages: this.messages.filter(msg => msg.role !== 'system'),
        timestamp: new Date().toISOString(),
        model: this.currentModel,
        systemPromptTitle: this.currentSystemPromptTitle,
        systemPrompt: this.systemPrompt
      };
      const jsonString = JSON.stringify(conversationData, null, 2);
      await this.copyToClipboard(jsonString, this.shadowRoot.getElementById('copyConversationButton'));
      const copyButton = this.shadowRoot.getElementById('copyConversationButton');
      if (copyButton) {
        const icon = copyButton.querySelector('.material-icon');
        if (icon) {
          const original = icon.textContent;
          icon.textContent = 'check';
          icon.className = 'material-icon icon--success';
          setTimeout(() => {
            icon.textContent = original;
            icon.className = 'material-icon icon--primary';
          }, 1500);
        }
      }
    } catch (err) {
      const copyButton = this.shadowRoot.getElementById('copyConversationButton');
      if (copyButton) {
        const icon = copyButton.querySelector('.material-icon');
        if (icon) {
          const original = icon.textContent;
          icon.textContent = 'error';
          icon.className = 'material-icon icon--destructive';
          setTimeout(() => {
            icon.textContent = original;
            icon.className = 'material-icon icon--primary';
          }, 1500);
        }
      }
    }
  }

  async pasteConversation() {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (clipboardText?.trim()) {
        return await this.processPastedContent(clipboardText);
      }
    } catch (e) {
      console.warn('System clipboard read failed:', e.message);
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
      document.body.appendChild(textarea);
      textarea.focus();
      document.execCommand('paste');
      const pasted = textarea.value;
      document.body.removeChild(textarea);
      if (pasted?.trim()) {
        return await this.processPastedContent(pasted);
      }
    } catch (e) {
      console.warn('execCommand paste failed:', e.message);
    }
    try {
      const appClipboard = await this.readFromAppClipboard();
      if (appClipboard?.trim()) {
        await this.processPastedContent(appClipboard);
        const pasteButton = this.shadowRoot.getElementById('pasteConversationButton');
        if (pasteButton) {
          const icon = pasteButton.querySelector('.material-icon');
          if (icon) {
            const original = icon.textContent;
            icon.textContent = 'check';
            icon.className = 'material-icon icon--success';
            setTimeout(() => {
              icon.textContent = original;
              icon.className = 'material-icon icon--primary';
            }, 1500);
          }
        }
        return;
      }
    } catch (e) {
      console.warn('App clipboard read failed:', e.message);
    }
    const pasteButton = this.shadowRoot.getElementById('pasteConversationButton');
    if (pasteButton) {
      const icon = pasteButton.querySelector('.material-icon');
      if (icon) {
        const original = icon.textContent;
        icon.textContent = 'error';
        icon.className = 'material-icon icon--destructive';
        setTimeout(() => {
          icon.textContent = original;
          icon.className = 'material-icon icon--primary';
        }, 1500);
      }
    }
  }

  async processPastedContent(text) {
    if (!text || text.trim() === '') {
      return;
    }
    let parsedData;
    try {
      parsedData = JSON.parse(text);
    } catch (jsonError) {
      return this.pasteConversationFromText(text);
    }
    if (!parsedData.messages || !Array.isArray(parsedData.messages)) {
      return;
    }
    const systemPromptToUse = parsedData.systemPrompt || this.systemPrompt;
    const newMessages = [{ role: 'system', content: systemPromptToUse }];
    parsedData.messages.forEach(msg => {
      if (msg.role && msg.content) {
        newMessages.push({
          role: msg.role,
          content: msg.content
        });
      }
    });
    this.messages = newMessages;
    localStorage.setItem(LOCAL_STORAGE_MESSAGES_KEY, JSON.stringify(this.messages));
    this.availableCodeTypes.clear();
    const codeBlockRegex = /```(\w*)\s*\n([\s\S]*?)\n\s*```/g;
    this.messages.forEach(msg => {
      let match;
      while ((match = codeBlockRegex.exec(msg.content)) !== null) {
        const lang = match[1];
        if (lang) {
          if (this.availableCodeTypes.size < 20) {
            this.availableCodeTypes.add(lang.toLowerCase());
          }
        }
      }
    });
    if (parsedData.systemPrompt) {
      this.systemPrompt = parsedData.systemPrompt;
      this.currentSystemPromptTitle = parsedData.systemPromptTitle || "custom";
      const systemInput = this.shadowRoot.getElementById('systemInput');
      const systemPromptSelect = this.shadowRoot.getElementById('systemPromptSelect');
      if (systemInput) systemInput.textContent = this.systemPrompt;
      if (systemPromptSelect) systemPromptSelect.value = this.currentSystemPromptTitle;
      localStorage.setItem(LOCAL_STORAGE_SYSTEM_PROMPT_KEY, this.systemPrompt);
      localStorage.setItem(LOCAL_STORAGE_SELECTED_SYSTEM_PROMPT_TITLE_KEY, this.currentSystemPromptTitle);
    }
    this.renderHistory();
  }

  pasteConversationFromText(text) {
    const lines = text.split('\n');
    const newMessages = [{ role: 'system', content: this.systemPrompt }];
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      if (trimmedLine.startsWith('You: ')) {
        newMessages.push({
          role: 'user',
          content: trimmedLine.substring(4).trim()
        });
      } else if (trimmedLine.startsWith('AI: ')) {
        newMessages.push({
          role: 'assistant',
          content: trimmedLine.substring(4).trim()
        });
      }
    }
    this.messages = newMessages;
    localStorage.setItem(LOCAL_STORAGE_MESSAGES_KEY, JSON.stringify(this.messages));
    this.availableCodeTypes.clear();
    const codeBlockRegex = /```(\w*)\s*\n([\s\S]*?)\n\s*```/g;
    this.messages.forEach(msg => {
      let match;
      while ((match = codeBlockRegex.exec(msg.content)) !== null) {
        const lang = match[1];
        if (lang) {
          if (this.availableCodeTypes.size < 20) {
            this.availableCodeTypes.add(lang.toLowerCase());
          }
        }
      }
    });
    this.renderHistory();
    const pasteButton = this.shadowRoot.getElementById('pasteConversationButton');
    if (pasteButton) {
      const icon = pasteButton.querySelector('.material-icon');
      if (icon) {
        const original = icon.textContent;
        icon.textContent = 'check';
        icon.className = 'material-icon icon--success';
        setTimeout(() => {
          icon.textContent = original;
          icon.className = 'material-icon icon--primary';
        }, 1500);
      }
    }
  }

  populateCodeFilterDropdown() {
    const codeFilterSelect = this.shadowRoot.getElementById('codeFilterSelect');
    if (!codeFilterSelect) return;
    const currentSelection = codeFilterSelect.value;
    codeFilterSelect.innerHTML = '';
    const addOption = (value, text) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      codeFilterSelect.appendChild(option);
    };
    addOption('all', 'All');
    addOption('no-code', 'No Code');
    addOption('all-code', 'Code Only');
    Array.from(this.availableCodeTypes).sort().forEach(type => {
      addOption(type, type.toUpperCase());
    });
    if (this.codeFilter && codeFilterSelect.querySelector(`option[value="${this.codeFilter}"]`)) {
      codeFilterSelect.value = this.codeFilter;
    } else {
      codeFilterSelect.value = 'all';
      this.codeFilter = 'all';
      localStorage.setItem(LOCAL_STORAGE_SELECTED_CODE_FILTER_KEY, this.codeFilter);
    }
  }

  _attachCodeBlockToggle(container, codeContent) {
    const pre = container.querySelector('pre');
    if (!pre) return;
    
    const header = container.querySelector('.code-block-header');
    if (!header) return;
    
    let actionsDiv = header.querySelector('div:last-child');
    if (!actionsDiv || actionsDiv.classList.contains('code-lang')) {
      actionsDiv = document.createElement('div');
      actionsDiv.style.display = 'flex';
      actionsDiv.style.gap = '4px';
      actionsDiv.style.alignItems = 'center';
      header.appendChild(actionsDiv);
    }
    
    const copyButton = document.createElement('button');
    copyButton.classList.add('copy-button', 'system-btn', 'system-btn-sm');
    copyButton.setAttribute('tabindex', '0');
    copyButton.setAttribute('role', 'button');
    copyButton.setAttribute('aria-label', 'Copy code block');
    copyButton.innerHTML = `<span class="material-icon" aria-hidden="true" style="font-size:1em;vertical-align:middle">content_copy</span>`;
    copyButton.title = 'Copy code';
    copyButton.onclick = (e) => {
      e.stopPropagation();
      const code = codeContent || pre.textContent;
      this.copyToClipboard(code, copyButton);
    };
    copyButton.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        copyButton.click();
      }
    });
    actionsDiv.appendChild(copyButton);
    
    const expandButton = document.createElement('button');
    expandButton.classList.add('expand-button', 'system-btn', 'system-btn-sm', 'system-btn-secondary');
    expandButton.setAttribute('tabindex', '0');
    expandButton.setAttribute('role', 'button');
    expandButton.setAttribute('aria-label', 'Expand code block');
    expandButton.innerHTML = `
      <span class="material-icon expand-icon" aria-hidden="true" style="font-size:1em;vertical-align:middle;transition:transform 0.2s">expand_more</span>
      <span class="expand-text">Show</span>
    `;
    expandButton.title = 'Expand code';
    expandButton.onclick = (e) => {
      e.stopPropagation();
      const isCollapsed = container.classList.contains('collapsed');
      container.classList.toggle('collapsed', !isCollapsed);
      container.classList.toggle('expanded', isCollapsed);
      
      const icon = expandButton.querySelector('.expand-icon');
      const text = expandButton.querySelector('.expand-text');
      if (isCollapsed) {
        icon.textContent = 'expand_less';
        text.textContent = 'Hide';
      } else {
        icon.textContent = 'expand_more';
        text.textContent = 'Show';
      }
    };
    expandButton.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        expandButton.click();
      }
    });
    actionsDiv.appendChild(expandButton);
  }

  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(36);
  }

  renderHistory() {
    const rawTextOutputDiv = this.shadowRoot.getElementById('rawTextOutput');
    if (!rawTextOutputDiv) return;
    rawTextOutputDiv.innerHTML = '';
    const displayMessages = this.messages.filter(msg => msg.role !== 'system');
    
    if (displayMessages.length === 0) {
      const welcomeP = document.createElement('p');
      welcomeP.className = 'system-text system-text-dim';
      welcomeP.innerHTML = `<span class="material-icon icon--ai" aria-hidden="true">smart_toy</span><span>AI: How can I help you today?</span>`;
      rawTextOutputDiv.appendChild(welcomeP);
    }
    
    displayMessages.forEach(msg => {
      const messageContainer = document.createElement('div');
      messageContainer.className = 'system-text';
      messageContainer.style.marginBottom = '12px';
      
      const codeBlockRegex = /```(\w*)\s*\n([\s\S]*?)\n\s*```/g;
      let match;
      let lastIndex = 0;
      let containsCode = false;
      
      while ((match = codeBlockRegex.exec(msg.content)) !== null) {
        containsCode = true;
        const [fullMatch, lang, code] = match;
        const precedingText = msg.content.substring(lastIndex, match.index).trim();
        
        if (precedingText) {
          const p = document.createElement('p');
          p.className = 'system-text';
          p.textContent = precedingText;
          messageContainer.appendChild(p);
        }
        
        const codeBlockContainer = document.createElement('div');
        codeBlockContainer.classList.add('code-block-container', 'collapsed', 'system-card');
        
        const header = document.createElement('div');
        header.classList.add('code-block-header', 'system-card-header');
        
        const langSpan = document.createElement('span');
        langSpan.classList.add('code-lang', 'system-text-small');
        langSpan.textContent = lang || 'plaintext';
        header.appendChild(langSpan);
        
        const actionsDiv = document.createElement('div');
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '4px';
        actionsDiv.style.alignItems = 'center';
        
        const copyButton = document.createElement('button');
        copyButton.classList.add('copy-button', 'system-btn', 'system-btn-sm');
        copyButton.setAttribute('tabindex', '0');
        copyButton.setAttribute('role', 'button');
        copyButton.setAttribute('aria-label', `Copy ${lang || 'code'} block`);
        copyButton.innerHTML = `<span class="material-icon" aria-hidden="true" style="font-size:1em;vertical-align:middle">content_copy</span>`;
        copyButton.title = 'Copy code';
        copyButton.onclick = (e) => {
          e.stopPropagation();
          this.copyToClipboard(code, copyButton);
        };
        copyButton.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            copyButton.click();
          }
        });
        actionsDiv.appendChild(copyButton);
        
        const expandButton = document.createElement('button');
        expandButton.classList.add('expand-button', 'system-btn', 'system-btn-sm', 'system-btn-secondary');
        expandButton.setAttribute('tabindex', '0');
        expandButton.setAttribute('role', 'button');
        expandButton.setAttribute('aria-label', 'Expand code block');
        expandButton.innerHTML = `
          <span class="material-icon expand-icon" aria-hidden="true" style="font-size:1em;vertical-align:middle;transition:transform 0.2s">expand_more</span>
          <span class="expand-text">Show</span>
        `;
        expandButton.title = 'Expand code';
        expandButton.onclick = (e) => {
          e.stopPropagation();
          const isCollapsed = codeBlockContainer.classList.contains('collapsed');
          codeBlockContainer.classList.toggle('collapsed', !isCollapsed);
          codeBlockContainer.classList.toggle('expanded', isCollapsed);
          
          const icon = expandButton.querySelector('.expand-icon');
          const text = expandButton.querySelector('.expand-text');
          if (isCollapsed) {
            icon.textContent = 'expand_less';
            text.textContent = 'Hide';
          } else {
            icon.textContent = 'expand_more';
            text.textContent = 'Show';
          }
        };
        expandButton.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            expandButton.click();
          }
        });
        actionsDiv.appendChild(expandButton);
        
        header.appendChild(actionsDiv);
        codeBlockContainer.appendChild(header);
        
        const pre = document.createElement('pre');
        pre.classList.add('system-font-mono');
        const codeElement = document.createElement('code');
        codeElement.textContent = code;
        pre.appendChild(codeElement);
        codeBlockContainer.appendChild(pre);
        messageContainer.appendChild(codeBlockContainer);
        
        if (msg.role === 'assistant' && lang) {
          if (this.availableCodeTypes.size < 20) {
            this.availableCodeTypes.add(lang.toLowerCase());
          }
        }
        
        lastIndex = match.index + fullMatch.length;
      }
      
      const remainingText = msg.content.substring(lastIndex).trim();
      if (remainingText || (!containsCode && msg.content.trim())) {
        const p = document.createElement('p');
        p.className = 'system-text';
        p.textContent = remainingText || msg.content;
        messageContainer.appendChild(p);
      }
      
      const rolePrefixP = document.createElement('p');
      rolePrefixP.className = 'system-text system-text-small';
      rolePrefixP.style.fontWeight = '600';
      rolePrefixP.style.marginBottom = '4px';
      
      const roleIcon = document.createElement('span');
      roleIcon.className = 'material-icon';
      roleIcon.setAttribute('aria-hidden', 'true');
      roleIcon.style.marginRight = '4px';
      roleIcon.style.verticalAlign = 'middle';
      
      const roleLabel = document.createElement('strong');
      
      if (msg.role === 'user') {
        roleIcon.className = 'material-icon icon--success';
        roleIcon.textContent = 'person';
        roleLabel.textContent = 'You:';
      } else {
        roleIcon.className = 'material-icon icon--ai';
        roleIcon.textContent = 'smart_toy';
        roleLabel.textContent = 'AI:';
      }
      
      rolePrefixP.appendChild(roleIcon);
      rolePrefixP.appendChild(roleLabel);
      
      const firstChild = messageContainer.firstChild;
      if (firstChild) {
        messageContainer.insertBefore(rolePrefixP, firstChild);
      } else {
        messageContainer.appendChild(rolePrefixP);
      }
      
      let shouldDisplay = false;
      if (this.codeFilter === 'all') {
        shouldDisplay = true;
      } else if (this.codeFilter === 'no-code') {
        shouldDisplay = !containsCode;
      } else if (this.codeFilter === 'all-code') {
        shouldDisplay = containsCode;
      } else {
        const filterLang = this.codeFilter;
        const messageContainsFilteredCode = [...msg.content.matchAll(codeBlockRegex)].some(([_, lang]) => lang.toLowerCase() === filterLang);
        shouldDisplay = messageContainsFilteredCode;
      }
      
      if (shouldDisplay) {
        rawTextOutputDiv.appendChild(messageContainer);
      }
    });
    
    this.populateCodeFilterDropdown();
    rawTextOutputDiv.scrollTop = rawTextOutputDiv.scrollHeight;
  }

  async copyToClipboard(text, button) {
    const showFeedback = (ligature, iconClass) => {
      if (!button) return;
      const icon = button.querySelector('.material-icon');
      if (icon) {
        const originalLigature = icon.textContent;
        const originalClass = icon.className;
        icon.textContent = ligature;
        icon.className = `material-icon ${iconClass}`;
        setTimeout(() => {
          icon.textContent = originalLigature;
          icon.className = originalClass;
        }, 1500);
      }
    };
    if (typeof text !== 'string') {
      console.error('Copy failed: non-string content', text);
      showFeedback('error', 'icon--destructive');
      return;
    }
    try {
      if (navigator.clipboard?.writeText &&
          (location.protocol === 'https:' || location.hostname === 'localhost' || location.protocol === 'file:')) {
        await navigator.clipboard.writeText(text);
        showFeedback('check', 'icon--success');
        return;
      }
    } catch (e) {
      console.warn('Clipboard API blocked, trying fallbacks:', e.message);
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      if (document.execCommand('copy')) {
        document.body.removeChild(textarea);
        showFeedback('check', 'icon--success');
        return;
      }
      document.body.removeChild(textarea);
    } catch (e) {
      console.warn('execCommand fallback failed:', e.message);
    }
    try {
      await this.storeInAppClipboard(text);
      showFeedback('save', 'icon--warning');
      this.showAppClipboardNotice();
    } catch (e) {
      console.error('All copy methods failed:', e);
      showFeedback('error', 'icon--destructive');
    }
  }

  async storeInAppClipboard(text) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('aiChatDB', 1);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('clipboard')) {
          db.createObjectStore('clipboard');
        }
      };
      request.onsuccess = (event) => {
        const db = event.target.result;
        const tx = db.transaction('clipboard', 'readwrite');
        const store = tx.objectStore('clipboard');
        const putRequest = store.put(text, '__system_clipboard');
        putRequest.onsuccess = () => {
          db.close();
          resolve();
        };
        putRequest.onerror = () => {
          db.close();
          reject(putRequest.error);
        };
      };
      request.onerror = () => reject(request.error);
    });
  }

  async readFromAppClipboard() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('aiChatDB', 1);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('clipboard')) {
          db.createObjectStore('clipboard');
        }
      };
      request.onsuccess = (event) => {
        const db = event.target.result;
        const tx = db.transaction('clipboard', 'readonly');
        const store = tx.objectStore('clipboard');
        const getRequest = store.get('__system_clipboard');
        getRequest.onsuccess = () => {
          db.close();
          resolve(getRequest.result || null);
        };
        getRequest.onerror = () => {
          db.close();
          reject(getRequest.error);
        };
      };
      request.onerror = () => reject(request.error);
    });
  }

  showAppClipboardNotice() {
    let notice = document.querySelector('#app-clipboard-notice');
    if (notice) {
      if (notice._timeout) clearTimeout(notice._timeout);
    } else {
      notice = document.createElement('div');
      notice.id = 'app-clipboard-notice';
      notice.className = 'system-alert system-alert-warning';
      notice.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 10000;
        max-width: 300px;
      `;
      document.body.appendChild(notice);
    }
    notice.innerHTML = `<span class="material-icon icon--warning" aria-hidden="true">save</span><span class="system-text">Copied to app clipboard. Use "Paste" button to retrieve.</span>`;
    notice._timeout = setTimeout(() => {
      if (notice.parentNode) notice.parentNode.removeChild(notice);
    }, 5000);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async sendMessage() {
    const textInput = this.shadowRoot.getElementById('textInput');
    const userPrompt = textInput.innerText;
    const temperature = parseFloat(this.shadowRoot.getElementById('temperatureInput').value);
    const rawTextOutputDiv = this.shadowRoot.getElementById('rawTextOutput');
    if (!userPrompt.trim()) return;
    if (!this.apiKey || this.apiKey.trim() === '') {
      rawTextOutputDiv.innerHTML = `<p class="system-text system-alert system-alert-danger"><span class="material-icon icon--destructive" aria-hidden="true">error</span>API key required</p>`;
      return;
    }
    if (this.currentStreamReader) {
      this.stopAIChatResponse();
    }
    if (isNaN(temperature) || temperature < 0 || temperature > 1) {
      rawTextOutputDiv.innerHTML = `<p class="system-text system-alert system-alert-danger"><span class="material-icon icon--destructive" aria-hidden="true">error</span>Invalid temperature</p>`;
      return;
    }
    this.messages.push({ role: 'user', content: userPrompt });
    this.renderHistory();
    textInput.innerHTML = '';
    
    const aiResponseContainer = document.createElement('div');
    aiResponseContainer.className = 'system-text';
    const responsePrefixP = document.createElement('p');
    
    const roleIcon = document.createElement('span');
    roleIcon.className = 'material-icon icon--ai';
    roleIcon.setAttribute('aria-hidden', 'true');
    roleIcon.style.marginRight = '4px';
    roleIcon.style.verticalAlign = 'middle';
    roleIcon.textContent = 'smart_toy';
    
    const responseSpan = document.createElement('span');
    responseSpan.id = 'ai-response-content';
    responseSpan.setAttribute('aria-live', 'polite');
    responseSpan.setAttribute('aria-atomic', 'false');
    
    responsePrefixP.appendChild(roleIcon);
    responsePrefixP.appendChild(responseSpan);
    aiResponseContainer.appendChild(responsePrefixP);
    
    rawTextOutputDiv.appendChild(aiResponseContainer);
    rawTextOutputDiv.scrollTop = rawTextOutputDiv.scrollHeight;
    
    const payload = {
      "model": this.currentModel,
      "messages": this.messages,
      "temperature": temperature,
      "stream": true
    };
    let fullResponse = '';
    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      };
      const response = await fetch(CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const reader = response.body.getReader();
      this.currentStreamReader = reader;
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let lines = buffer.split('\n');
        buffer = '';
        for (let line of lines) {
          line = line.trim();
          if (!line || line.startsWith('event:') || line.startsWith('id:') || line.startsWith('retry:')) {
            continue;
          }
          if (line.startsWith('')) {
            const data = line.substring(5).trim();
            if (data === '[DONE]') {
              break;
            }
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                responseSpan.textContent = fullResponse;
                
                const newCodeBlocks = responseSpan.parentElement.querySelectorAll('.code-block-container:not([data-toggle-initialized])');
                newCodeBlocks.forEach(container => {
                  container.setAttribute('data-toggle-initialized', 'true');
                  container.classList.add('collapsed');
                  const pre = container.querySelector('pre');
                  const codeContent = pre ? pre.textContent : '';
                  this._attachCodeBlockToggle(container, codeContent);
                });
                
                setTimeout(() => {
                  rawTextOutputDiv.scrollTop = rawTextOutputDiv.scrollHeight;
                }, 0);
              }
            } catch (jsonError) {
            }
          } else {
            buffer += line + '\n';
          }
        }
      }
      this.messages.push({ role: 'assistant', content: fullResponse });
      localStorage.setItem(LOCAL_STORAGE_MESSAGES_KEY, JSON.stringify(this.messages));
      this.renderHistory();
    } catch (error) {
      if (responseSpan) {
        responseSpan.textContent = `Error: ${error.message || 'Unknown error'}`;
        responseSpan.className = 'system-text system-text-dim icon--destructive';
      }
      if (this.messages[this.messages.length - 1]?.role === 'user' && this.messages[this.messages.length - 1]?.content === userPrompt) {
        this.messages.pop();
      }
      this.stopAIChatResponse();
    } finally {
      this.currentStreamReader = null;
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        @font-face {
          font-family: 'Material Icons';
          font-style: normal;
          font-weight: 400;
          src: url('/system/fonts/MaterialIcons-Regular.ttf') format('truetype');
          font-display: block;
        }
        .material-icon {
          font-family: 'Material Icons';
          font-weight: normal;
          font-style: normal;
          font-size: 1em;
          line-height: 1;
          letter-spacing: normal;
          text-transform: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          white-space: nowrap;
          word-wrap: normal;
          direction: ltr;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
          vertical-align: middle;
        }
        
        /* 🔽 ICON COLOR CLASSES */
        .icon--primary { 
          color: var(--system-accent, #007bff) !important;
          text-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }
        .icon--secondary { 
          color: var(--system-text, #333333) !important;
          filter: brightness(0.75);
        }
        .icon--destructive { 
          color: var(--system-danger, #dc3545) !important;
          text-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }
        .icon--success { 
          color: var(--system-success, #28a745) !important;
          text-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }
        .icon--warning { 
          color: var(--system-warning, #ffc107) !important;
          text-shadow: 0 1px 2px rgba(0,0,0,0.3);
        }
        .icon--ai { 
          color: var(--system-info, #6f42c1) !important;
          text-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }
        .icon--on-accent {
          color: var(--system-text-on-accent, var(--system-text-on-primary, #ffffff)) !important;
          text-shadow: 0 1px 2px rgba(0,0,0,0.2);
        }
        
        /* 🔽 FIXED LAYOUT */
        :host {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          font-family: var(--system-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
          background-color: var(--system-bg, #ffffff);
          color: var(--system-text, #333333);
          overflow: hidden;
        }
        
        #mainChatTool {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          overflow: hidden;
        }
        
        .section {
          padding: 6px 8px;
          border-bottom: 1px solid var(--system-border, #eee);
          box-sizing: border-box;
          background: var(--system-window-bg, transparent);
          flex-shrink: 0;
        }
        .section:last-of-type {
          border-bottom: none;
        }
        
        .title-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex-shrink: 0;
          padding-bottom: 3px;
          color: var(--system-text, #333);
        }
        .title-text {
          overflow: hidden;
          text-overflow: clip;
          white-space: nowrap;
          font-size: 0.95em;
        }
        
        /* 🔽 TWO-ROW TOP MENU LAYOUT */
        .top-menu {
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex-shrink: 0;
        }
        
        .top-menu-row {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        
        .top-menu-row--controls {
          justify-content: flex-end;
        }
        
        .top-menu-row > div {
          display: flex;
          gap: 6px;
          align-items: center;
          flex-grow: 1;
          min-width: 0;
        }
        
        .top-menu select {
          flex-grow: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        #systemInputContainer {
          display: none;
          padding-top: 8px;
          padding-bottom: 4px;
        }
        
        .input-group {
          margin-bottom: 6px;
        }
        .input-group label {
          display: block;
          margin-bottom: 3px;
          font-weight: 600;
          font-size: 0.8em;
          color: var(--system-text-dim, #555);
        }
        
        /* 🔽 SYSTEM BUTTON STYLES */
        .system-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 16px;
          font-size: 0.9em;
          font-weight: 500;
          font-family: var(--system-font, inherit);
          color: var(--system-text-on-accent, var(--system-text-on-primary, #ffffff));
          background: var(--system-accent, #007bff);
          border: 1px solid var(--system-border, transparent);
          border-radius: var(--system-radius, 8px);
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: var(--system-shadow, none);
          text-decoration: none;
          white-space: nowrap;
          min-height: 36px;
          text-shadow: 0 1px 2px rgba(0,0,0,0.2);
        }
        .system-btn:hover {
          opacity: 0.9;
          box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.2);
          filter: brightness(0.95);
        }
        .system-btn:active {
          transform: scale(0.98);
        }
        .system-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .system-btn-secondary {
          background: var(--system-window-bg, transparent);
          color: var(--system-text, #333333);
          border: 1px solid var(--system-border, #ccc);
          text-shadow: none;
        }
        .system-btn-secondary:hover {
          background: var(--system-border, #eee);
          border-color: var(--system-border-hover, #999);
          color: var(--system-text, #000);
        }

        .system-btn-ghost {
          background: transparent;
          border: 1px solid transparent;
          color: var(--system-text, #333);
          text-shadow: none;
        }
        .system-btn-ghost:hover {
          background: var(--system-border, rgba(0,0,0,0.05));
          border-color: var(--system-border, #ccc);
        }

        .system-btn-danger {
          background: var(--system-danger, #dc3545);
          color: var(--system-text-on-accent, var(--system-text-on-danger, #ffffff));
          text-shadow: 0 1px 2px rgba(0,0,0,0.2);
        }
        .system-btn-danger:hover {
          box-shadow: 0 0 0 3px rgba(220, 53, 69, 0.2);
          filter: brightness(0.95);
        }

        .system-btn-sm {
          padding: 4px 10px;
          font-size: 0.8em;
          min-height: 28px;
        }
        .system-btn-lg {
          padding: 12px 24px;
          font-size: 1.1em;
          min-height: 44px;
        }

        .system-btn-icon {
          width: 36px;
          height: 36px;
          padding: 0;
          border-radius: var(--system-radius, 8px);
          background: var(--system-accent, #007bff);
        }
        .system-btn-icon .material-icon {
          font-size: 1.2em;
          color: var(--system-text-on-accent, var(--system-text-on-primary, #ffffff)) !important;
          text-shadow: 0 1px 2px rgba(0,0,0,0.2);
        }

        .system-btn-group {
          display: inline-flex;
          gap: 4px;
          flex-wrap: wrap;
        }
        .system-btn-block {
          width: 100%;
          justify-content: center;
        }

        /* 🔽 SYSTEM SELECT/DROPDOWN STYLES */
        .system-select {
          display: inline-flex;
          align-items: center;
          width: auto;
          min-width: 120px;
          max-width: 100%;
          padding: 6px 28px 6px 12px;
          font-size: 0.9em;
          font-family: var(--system-font, inherit);
          color: var(--system-text, #333);
          background: var(--system-window-bg, #fff) 
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") 
            no-repeat right 8px center / 16px;
          border: 1px solid var(--system-border, #ccc);
          border-radius: var(--system-radius, 8px);
          appearance: none;
          cursor: pointer;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .system-select:hover {
          border-color: var(--system-border-hover, #999);
        }
        .system-select:focus {
          outline: none;
          border-color: var(--system-accent, #007bff);
          box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.2);
        }
        .system-select:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          background-color: var(--system-border, #f5f5f5);
        }
        .system-select option {
          background: var(--system-menu-bg, #fff);
          color: var(--system-text, #333);
          padding: 8px;
        }
        .system-select option:hover {
          background: var(--system-border, #f0f0f0);
        }

        /* 🔽 SYSTEM INPUT */
        .system-input {
          display: block;
          width: 100%;
          padding: 8px 12px;
          font-size: 0.95em;
          font-family: var(--system-font, inherit);
          color: var(--system-text, #333);
          background: var(--system-window-bg, #fff);
          border: 1px solid var(--system-border, #ccc);
          border-radius: var(--system-radius, 8px);
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
          box-sizing: border-box;
        }
        .system-input:focus {
          outline: none;
          border-color: var(--system-accent, #007bff);
          box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.2);
        }
        .system-input[contenteditable="true"] {
          min-height: 40px;
          cursor: text;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .system-input[contenteditable="true"]:empty:before {
          content: attr(placeholder);
          color: var(--system-text-dim, #aaa);
          pointer-events: none;
        }

        .system-label {
          display: block;
          font-size: 0.85em;
          font-weight: 500;
          color: var(--system-text-dim, #666);
          margin-bottom: 4px;
        }

        .system-card {
          background: var(--system-window-bg, #fff);
          border: 1px solid var(--system-border, #ddd);
          border-radius: var(--system-radius, 8px);
          box-shadow: var(--system-shadow, 0 2px 8px rgba(0,0,0,0.1));
        }
        .system-card-header {
          background: var(--system-header-bg, #f8f9fa);
          border-bottom: 1px solid var(--system-border, #eee);
          padding: 8px 12px;
          font-weight: 500;
          font-size: 0.9em;
          color: var(--system-text, #333);
        }
        .system-card-body {
          padding: 12px;
        }

        .system-text {
          font-size: 0.95em;
          line-height: 1.5;
          color: var(--system-text, #333);
          margin: 0;
        }
        .system-text-small {
          font-size: 0.8em;
          color: var(--system-text-dim, #666);
        }
        .system-text-dim {
          color: var(--system-text-dim, #666);
        }

        .system-alert {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 10px 12px;
          border-left: 4px solid var(--system-info, #2196f3);
          background: rgba(33, 150, 243, 0.1);
          border-radius: 0 var(--system-radius, 8px) var(--system-radius, 8px) 0;
          margin: 8px 0;
        }
        .system-alert-success {
          border-left-color: var(--system-success, #4caf50);
          background: rgba(76, 175, 80, 0.1);
        }
        .system-alert-warning {
          border-left-color: var(--system-warning, #ffc107);
          background: rgba(255, 193, 7, 0.1);
        }
        .system-alert-danger {
          border-left-color: var(--system-danger, #dc3545);
          background: rgba(220, 53, 69, 0.1);
        }

        .system-font-mono {
          font-family: var(--system-font-mono, 'Courier New', monospace);
        }

        .chat-area {
          flex: 1 1 auto;
          min-height: 0;
          overflow-x: hidden;
          overflow-y: auto;
          font-size: 0.9em;
          line-height: 1.4;
          background-color: var(--system-bg, #f9f9f9);
          box-sizing: border-box;
          padding: 8px;
          margin: 0;
        }
        .chat-area p {
          margin: 0 0 6px 0;
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 0.9em;
        }
        .chat-area p:last-child {
          margin-bottom: 0;
        }
        
        .code-block-container {
          background-color: var(--system-window-bg, #f4f4f4);
          border: 1px solid var(--system-border, #e1e1e1);
          border-radius: var(--system-radius, 4px);
          margin: 8px 0;
          overflow: hidden;
          font-size: 0.85em;
        }
        .code-block-container.collapsed pre {
          max-height: 120px;
          overflow: hidden;
          position: relative;
        }
        .code-block-container.collapsed pre::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 40px;
          background: linear-gradient(transparent, var(--system-window-bg, #f4f4f4));
          pointer-events: none;
        }
        .expand-button {
          background: none;
          border: none;
          color: var(--system-accent, #007bff);
          cursor: pointer;
          font-size: 0.75em;
          padding: 2px 6px;
          border-radius: var(--system-radius, 3px);
          display: flex;
          align-items: center;
          gap: 2px;
        }
        .expand-button:hover {
          background-color: var(--system-border, #e9e9e9);
        }
        .code-block-container.expanded .expand-button .expand-icon {
          transform: rotate(180deg);
        }
        
        .code-block-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background-color: var(--system-header-bg, #e9e9e9);
          padding: 4px 8px;
          border-bottom: 1px solid var(--system-border, #e1e1e1);
          font-size: 0.75em;
          color: var(--system-text-dim, #555);
        }
        .code-lang {
          font-weight: 600;
          text-transform: uppercase;
        }
        .code-block-container pre {
          margin: 0;
          padding: 8px;
          overflow-x: auto;
          font-size: 0.85em;
          line-height: 1.3;
          white-space: pre-wrap;
          word-break: break-all;
          font-family: var(--system-font-mono, 'Courier New', monospace);
          color: var(--system-text, #333);
        }
        .code-block-container code {
          display: block;
        }
        
        .copy-button {
          min-width: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .input-area-wrapper {
          display: flex;
          align-items: flex-end;
          gap: 6px;
          flex-shrink: 0;
          padding: 6px 8px;
          background-color: var(--system-window-bg, #fff);
          border-top: 1px solid var(--system-border, #eee);
          box-sizing: border-box;
        }
        
        #sendButton {
          padding: 0;
          background-color: var(--system-accent, #007bff);
          color: var(--system-text-on-accent, white);
          border: none;
          border-radius: var(--system-radius, 4px);
          cursor: pointer;
          font-size: 1.3em;
          flex-shrink: 0;
          line-height: 1;
          min-width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        #sendButton:hover {
          background-color: var(--system-accent-dim, #0056b3);
        }
        
        .close-button {
          background: none;
          border: none;
          font-size: 1.2em;
          cursor: pointer;
          color: var(--system-danger, #dc3545);
          padding: 0;
          min-width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .close-button:hover {
          color: var(--system-danger, #a71d2a);
        }
        
        .icon-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
        
        @media (prefers-reduced-motion: reduce) {
          .expand-icon,
          .copy-button,
          .expand-button,
          .system-btn {
            transition: none !important;
            animation: none !important;
          }
        }
        
        @supports not (backdrop-filter: blur(10px)) {
          .system-card,
          .code-block-container {
            background: var(--system-window-bg, rgba(255,255,255,0.95)) !important;
            backdrop-filter: none !important;
          }
        }
      </style>
      <div id="mainChatTool">
        <div class="title-bar section" style="display: none;">
          <span class="title-text system-text"></span>
          <button id="closeButton" class="close-button system-btn system-btn-icon" style="display: none;" aria-label="Close chat">
            <span class="material-icon icon--destructive" aria-hidden="true">close</span>
          </button>
        </div>
        
        <!-- 🔽 TWO-ROW TOP MENU -->
        <div class="top-menu section">
          <!-- Row 1: System Button + Model Dropdown + Filter Dropdown -->
          <div class="top-menu-row">
            <div>
              <button id="systemPromptButton" class="system-btn system-btn-icon" title="Settings" aria-label="Settings">
                <span class="material-icon icon--on-accent" aria-hidden="true">settings</span>
              </button>
              <select id="modelSelect" class="system-select" aria-label="Select model"></select>
              <select id="codeFilterSelect" class="system-select system-btn-sm" title="Filter by code type" aria-label="Filter code"></select>
            </div>
          </div>
          
          <!-- Row 2: Action Buttons (Copy, Paste, Clear) - Reset moved to Settings -->
          <div class="top-menu-row top-menu-row--controls">
            <div class="system-btn-group">
              <button id="copyConversationButton" class="system-btn system-btn-icon" title="Copy conversation" aria-label="Copy conversation">
                <span class="material-icon icon--on-accent" aria-hidden="true">content_copy</span>
              </button>
              <button id="pasteConversationButton" class="system-btn system-btn-icon" title="Paste conversation" aria-label="Paste conversation">
                <span class="material-icon icon--on-accent" aria-hidden="true">content_paste</span>
              </button>
              <button id="clearChatButton" class="system-btn system-btn-icon" title="Clear chat" aria-label="Clear chat">
                <span class="material-icon icon--on-accent" aria-hidden="true">delete_outline</span>
              </button>
            </div>
          </div>
        </div>
        
        <!-- 🔽 SETTINGS PANEL (collapsible) - Reset button moved here -->
        <div id="systemInputContainer" class="section">
          <div class="input-group">
            <label for="apiKeyInput" class="system-label">API Key:</label>
            <input type="password" id="apiKeyInput" class="system-input" placeholder="API key" value="${this.apiKey || ''}">
          </div>
          <div class="input-group">
            <label for="systemPromptSelect" class="system-label">System:</label>
            <select id="systemPromptSelect" class="system-select" aria-label="Select system prompt"></select>
          </div>
          <div class="input-group">
            <div id="systemInput" class="system-input" contenteditable="true" placeholder="System prompt..."></div>
          </div>
          <div class="input-group">
            <label for="temperatureInput" class="system-label">Temp:</label>
            <input type="number" id="temperatureInput" class="system-input" value="0.7" min="0" max="1" step="0.1" aria-label="Temperature">
          </div>
          <div class="input-group" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--system-border, #eee);">
            <button id="resetSettingsButton" class="system-btn system-btn-sm system-btn-secondary" title="Reset models and system prompts" aria-label="Reset Settings">
              <span class="material-icon icon--secondary" aria-hidden="true">refresh</span>
              <span class="system-text system-text-small">Reset Settings</span>
            </button>
          </div>
        </div>
        
        <div id="rawTextOutput" class="chat-area" spellcheck="false">
          <p class="system-text system-text-dim"><span class="material-icon icon--ai" aria-hidden="true">smart_toy</span><span>AI: How can I help you today?</span></p>
        </div>
        
        <div class="input-area-wrapper">
          <div id="textInput" class="system-input" contenteditable="true" placeholder="Type your message (Ctrl+Enter or Cmd+Enter to send)..." aria-label="Message input"></div>
          <button id="sendButton" class="system-btn system-btn-icon" aria-label="Send message">
            <span class="material-icon icon--on-accent" aria-hidden="true">send</span>
          </button>
        </div>
      </div>
    `;
  }
}

if (!customElements.get('ai-chat')) {
  customElements.define('ai-chat', AIChat);
}