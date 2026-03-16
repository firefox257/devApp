// ./ux/aichat.js
const API_BASE_URL = "https://gen.pollinations.ai/v1"; // ✅ FIXED: Removed trailing spaces
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
	}

	disconnectedCallback() {
		if (this.onCloseCallback) {
			this.onCloseCallback();
		}
		this.stopAIChatResponse();
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
		// 🔑 CRITICAL FIX: ENTER KEY BEHAVIOR
		if (textInputDiv) {
			textInputDiv.addEventListener('keydown', (event) => {
					// ONLY send on Ctrl+Enter (Windows/Linux) or Cmd+Enter (Mac)
					if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
						event.preventDefault();
						this.sendMessage();
					}
					// NO preventDefault() for plain Enter → preserves natural newline insertion
					// Tab key works normally for indentation
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
				copyButton.textContent = '✅';
				setTimeout(() => {
						copyButton.textContent = '📋';
					}, 1500);
			}
		} catch (err) {
			const copyButton = this.shadowRoot.getElementById('copyConversationButton');
			if (copyButton) {
				copyButton.textContent = '❌';
				setTimeout(() => {
						copyButton.textContent = '📋';
					}, 1500);
			}
		}
	}

	async pasteConversation() {
		// ✅ FIRST: Try system clipboard (modern API)
		try {
			const clipboardText = await navigator.clipboard.readText();
			if (clipboardText?.trim()) {
				return await this.processPastedContent(clipboardText);
			}
		} catch (e) {
			console.warn('System clipboard read failed:', e.message);
		}

		// 🔄 SECOND: Try execCommand fallback (legacy)
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

		// 💾 THIRD: Try IndexedDB app clipboard
		try {
			const appClipboard = await this.readFromAppClipboard();
			if (appClipboard?.trim()) {
				await this.processPastedContent(appClipboard);
				const pasteButton = this.shadowRoot.getElementById('pasteConversationButton');
				if (pasteButton) {
					pasteButton.textContent = '✅';
					setTimeout(() => pasteButton.textContent = '📥', 1500);
				}
				return;
			}
		} catch (e) {
			console.warn('App clipboard read failed:', e.message);
		}

		// ❌ All methods failed
		const pasteButton = this.shadowRoot.getElementById('pasteConversationButton');
		if (pasteButton) {
			pasteButton.textContent = '❌';
			setTimeout(() => pasteButton.textContent = '📥', 1500);
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
		this.messages.forEach(msg => {
				const codeBlockRegex = /```(\w*)\s*([\s\S]*?)```/g; // ✅ FIXED regex
				let match;
				while ((match = codeBlockRegex.exec(msg.content)) !== null) {
					const lang = match[1];
					if (lang) {
						this.availableCodeTypes.add(lang.toLowerCase());
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
		this.messages.forEach(msg => {
				const codeBlockRegex = /```(\w*)\s*([\s\S]*?)```/g; // ✅ FIXED regex
				let match;
				while ((match = codeBlockRegex.exec(msg.content)) !== null) {
					const lang = match[1];
					if (lang) {
						this.availableCodeTypes.add(lang.toLowerCase());
					}
				}
			});

		this.renderHistory();

		const pasteButton = this.shadowRoot.getElementById('pasteConversationButton');
		if (pasteButton) {
			pasteButton.textContent = '✅';
			setTimeout(() => {
					pasteButton.textContent = '📥';
				}, 1500);
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

	renderHistory() {
		const rawTextOutputDiv = this.shadowRoot.getElementById('rawTextOutput');
		if (!rawTextOutputDiv) return;

		rawTextOutputDiv.innerHTML = '';
		const displayMessages = this.messages.filter(msg => msg.role !== 'system');

		if (displayMessages.length === 0) {
			const welcomeP = document.createElement('p');
			welcomeP.textContent = '🤖: How can I help you today?';
			welcomeP.style.color = '#888';
			welcomeP.style.fontSize = '0.9em';
			rawTextOutputDiv.appendChild(welcomeP);
		}

		displayMessages.forEach(msg => {
				// ✅ FIXED: Wrap entire message with role prefix once
				const messageContainer = document.createElement('div');
				messageContainer.style.marginBottom = '12px';

				const codeBlockRegex = /```(\w*)\s*([\s\S]*?)```/g; // ✅ FIXED regex
				let match;
				let lastIndex = 0;
				let containsCode = false;

				while ((match = codeBlockRegex.exec(msg.content)) !== null) {
					containsCode = true;
					const [fullMatch, lang, code] = match;
					const precedingText = msg.content.substring(lastIndex, match.index).trim();

					if (precedingText) {
						const p = document.createElement('p');
						p.textContent = precedingText;
						messageContainer.appendChild(p);
					}

					const codeBlockContainer = document.createElement('div');
					codeBlockContainer.classList.add('code-block-container');

					const header = document.createElement('div');
					header.classList.add('code-block-header');

					const langSpan = document.createElement('span');
					langSpan.classList.add('code-lang');
					langSpan.textContent = lang || 'plaintext';
					header.appendChild(langSpan);

					const copyButton = document.createElement('button');
					copyButton.classList.add('copy-button');
					copyButton.textContent = '📋';
					copyButton.title = 'Copy';
					copyButton.onclick = () => this.copyToClipboard(code, copyButton);
					header.appendChild(copyButton);

					codeBlockContainer.appendChild(header);

					const pre = document.createElement('pre');
					const codeElement = document.createElement('code');
					codeElement.textContent = code;
					pre.appendChild(codeElement);
					codeBlockContainer.appendChild(pre);

					messageContainer.appendChild(codeBlockContainer);

					if (msg.role === 'assistant' && lang) {
						this.availableCodeTypes.add(lang.toLowerCase());
					}

					lastIndex = match.index + fullMatch.length;
				}

				const remainingText = msg.content.substring(lastIndex).trim();
				if (remainingText || (!containsCode && msg.content.trim())) {
					const p = document.createElement('p');
					p.textContent = remainingText || msg.content;
					messageContainer.appendChild(p);
				}

				// ✅ FIXED: Add role prefix ONCE at the top of the message
				const rolePrefix = msg.role === 'user' ? '👤 You' : '🤖 AI';
				const firstChild = messageContainer.firstChild;
				if (firstChild) {
					if (firstChild.tagName === 'P') {
						firstChild.textContent = `${rolePrefix}: ${firstChild.textContent}`;
					} else {
						const prefixP = document.createElement('p');
						prefixP.textContent = `${rolePrefix}:`;
						prefixP.style.fontWeight = 'bold';
						prefixP.style.marginBottom = '4px';
						messageContainer.insertBefore(prefixP, firstChild);
					}
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

	// ✅ NEW: Robust clipboard handler with 3-tier fallback
	async copyToClipboard(text, button) {
		const showFeedback = (icon) => {
			if (!button) return;
			const original = button.textContent;
			button.textContent = icon;
			setTimeout(() => button.textContent = original, 1500);
		};

		if (typeof text !== 'string') {
			console.error('Copy failed: non-string content', text);
			showFeedback('❌');
			return;
		}

		// ✅ ATTEMPT 1: Modern clipboard API (secure contexts only)
		try {
			if (navigator.clipboard?.writeText && 
					(location.protocol === 'https:' || location.hostname === 'localhost' || location.protocol === 'file:')) {
				await navigator.clipboard.writeText(text);
				showFeedback('✅');
				return;
			}
		} catch (e) {
			console.warn('Clipboard API blocked, trying fallbacks:', e.message);
		}

		// 🔄 ATTEMPT 2: execCommand via light DOM textarea (works in HTTP)
		try {
			const textarea = document.createElement('textarea');
			textarea.value = text;
			textarea.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
			document.body.appendChild(textarea); // MUST be in light DOM
			
			textarea.select();
			textarea.setSelectionRange(0, textarea.value.length); // Mobile support
			
			if (document.execCommand('copy')) {
				document.body.removeChild(textarea);
				showFeedback('✅');
				return;
			}
			document.body.removeChild(textarea);
		} catch (e) {
			console.warn('execCommand fallback failed:', e.message);
		}

		// 💾 ATTEMPT 3: IndexedDB fallback (app-scoped storage ONLY)
		try {
			await this.storeInAppClipboard(text);
			showFeedback('💾'); // Visual cue: stored internally, not system clipboard
			this.showAppClipboardNotice();
		} catch (e) {
			console.error('All copy methods failed:', e);
			showFeedback('❌');
		}
	}

	// ✅ NEW: Store in IndexedDB under __system_clipboard
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

	// ✅ NEW: Read from IndexedDB
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

	// ✅ NEW: Show subtle notice about app-scoped clipboard
	showAppClipboardNotice() {
		// Find existing notice
		let notice = document.querySelector('#app-clipboard-notice');
		if (notice) {
			// Reset timeout if already showing
			if (notice._timeout) clearTimeout(notice._timeout);
		} else {
			notice = document.createElement('div');
			notice.id = 'app-clipboard-notice';
			notice.style.cssText = `
				position: fixed;
				bottom: 20px;
				right: 20px;
				background: #fff3cd;
				border: 1px solid #ffeaa7;
				color: #856404;
				padding: 8px 12px;
				border-radius: 4px;
				font-size: 0.85em;
				z-index: 10000;
				box-shadow: 0 2px 6px rgba(0,0,0,0.1);
				max-width: 300px;
			`;
			document.body.appendChild(notice); // Append to light DOM for visibility
		}
		
		notice.textContent = '📋 Copied to app clipboard (Ctrl+V unavailable). Use "📥 Paste" button to retrieve.';
		
		// Auto-dismiss after 5s
		notice._timeout = setTimeout(() => {
			if (notice.parentNode) notice.parentNode.removeChild(notice);
		}, 5000);
	}

	async sendMessage() {
		const textInput = this.shadowRoot.getElementById('textInput');
		const userPrompt = textInput.innerText; // PRESERVES newlines, tabs, spaces
		const temperature = parseFloat(this.shadowRoot.getElementById('temperatureInput').value);
		const rawTextOutputDiv = this.shadowRoot.getElementById('rawTextOutput');

		// Skip if only whitespace
		if (!userPrompt.trim()) {
			return;
		}

		if (!this.apiKey || this.apiKey.trim() === '') {
			rawTextOutputDiv.innerHTML = '<p style="color:red;font-size:0.9em;">⚠️ API key required</p>';
			return;
		}

		if (this.currentStreamReader) {
			this.stopAIChatResponse();
		}

		if (isNaN(temperature) || temperature < 0 || temperature > 1) {
			rawTextOutputDiv.innerHTML = '<p style="color:red;font-size:0.9em;">⚠️ Invalid temperature</p>';
			return;
		}

		// Store RAW user input with all formatting intact
		this.messages.push({ role: 'user', content: userPrompt });
		this.renderHistory();
		textInput.innerHTML = ''; // Clear input after sending

		const aiResponseContainer = document.createElement('div');
		aiResponseContainer.innerHTML = '<p>🤖: <span id="ai-response-content"></span></p>';
		rawTextOutputDiv.appendChild(aiResponseContainer);
		const responseSpan = aiResponseContainer.querySelector('#ai-response-content');
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

					if (line.startsWith('data: ')) {
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
			// ✅ FIXED: Removed debug alert("done")

			this.messages.push({ role: 'assistant', content: fullResponse });
			localStorage.setItem(LOCAL_STORAGE_MESSAGES_KEY, JSON.stringify(this.messages));
			this.renderHistory();

		} catch (error) {
			if (responseSpan) {
				responseSpan.textContent = `⚠️ ${error.message || 'Error'}`;
				responseSpan.style.color = 'red';
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
		:host {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		box-sizing: border-box;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		background-color: #fff;
		color: #333;
		overflow: hidden;
		}
		#mainChatTool {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		box-sizing: border-box;
		}
		.section {
		padding: 6px 8px;
		border-bottom: 1px solid #eee;
		box-sizing: border-box;
		}
		.section:last-of-type {
		border-bottom: none;
		}
		.title-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-weight: bold;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex-shrink: 0;
		padding-bottom: 3px;
		}
		.title-text {
		overflow: hidden;
		text-overflow: clip;
		white-space: nowrap;
		font-size: 0.95em;
		}
		.top-menu {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-shrink: 0;
		gap: 4px;
		}
		.top-menu > div {
		display: flex;
		gap: 4px;
		flex-grow: 1;
		min-width: 0;
		align-items: center;
		}
		.top-menu button, .top-menu select {
		padding: 4px 8px;
		border: 1px solid #ddd;
		border-radius: 4px;
		background-color: #fff;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.85em;
		color: #333;
		box-sizing: border-box;
		min-height: 28px;
		}
		.top-menu button:hover, .top-menu select:hover {
		background-color: #f5f5f5;
		}
		#modelSelect, #systemPromptSelect, #codeFilterSelect {
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
		font-weight: bold;
		font-size: 0.8em;
		color: #555;
		}
		.input-group input[type="number"],
		.input-group input[type="password"] {
		width: calc(100% - 2px);
		padding: 6px;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 0.85em;
		box-sizing: border-box;
		font-family: inherit;
		color: #333;
		}
		.input-group select {
		width: calc(100% - 2px);
		padding: 6px;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 0.85em;
		box-sizing: border-box;
		font-family: inherit;
		color: #333;
		}
		#textInput, #systemInput {
		flex-grow: 1;
		border: 1px solid #ddd;
		background-color: #fff;
		padding: 10px;
		min-height: 110px;
		max-height: 150px;
		overflow-y: auto;
		border-radius: 4px;
		cursor: text;
		font-family: inherit;
		font-size: 0.95em;
		line-height: 1.4;
		box-sizing: border-box;
		color: #333;
		margin: 0;
		/* 🔑 CRITICAL FIX: PRESERVE FORMATTING WHILE TYPING */
		white-space: pre-wrap; /* Preserves newlines/tabs in input */
		word-break: break-word;
		}
		#textInput[contenteditable="true"]:focus,
		#systemInput[contenteditable="true"]:focus {
		outline: none;
		border-color: #007bff;
		box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.2);
		}
		#textInput:empty:before, #systemInput:empty:before {
		content: attr(placeholder);
		color: #aaa;
		pointer-events: none;
		display: block;
		}
		.chat-area {
		flex-grow: 1;
		overflow-x: hidden;
		overflow-y: auto;
		font-size: 0.9em;
		line-height: 1.4;
		background-color: #f9f9f9;
		min-height: 50px;
		box-sizing: border-box;
		padding: 8px;
		margin: 0;
		}
		.chat-area p {
		margin: 0 0 6px 0;
		/* 🔑 CRITICAL FIX: PRESERVE FORMATTING IN HISTORY */
		white-space: pre-wrap; /* CRITICAL: Shows tabs/newlines correctly */
		word-break: break-word;
		font-size: 0.9em;
		}
		.chat-area p:last-child {
		margin-bottom: 0;
		}
		.code-block-container {
		background-color: #f4f4f4;
		border: 1px solid #e1e1e1;
		border-radius: 4px;
		margin: 8px 0;
		overflow: hidden;
		font-size: 0.85em;
		}
		.code-block-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		background-color: #e9e9e9;
		padding: 4px 8px;
		border-bottom: 1px solid #e1e1e1;
		font-size: 0.75em;
		color: #555;
		}
		.code-lang {
		font-weight: bold;
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
		font-family: 'Courier New', monospace;
		}
		.code-block-container code {
		display: block;
		}
		.copy-button {
		background-color: #007bff;
		color: white;
		border: none;
		border-radius: 3px;
		padding: 2px 6px;
		font-size: 0.75em;
		cursor: pointer;
		min-width: 24px;
		}
		.copy-button:hover {
		background-color: #0056b3;
		}
		.input-area-wrapper {
		display: flex;
		align-items: flex-end;
		gap: 6px;
		flex-shrink: 0;
		padding: 6px 8px;
		background-color: #fff;
		border-top: 1px solid #eee;
		box-sizing: border-box;
		}
		#sendButton {
		padding: 8px 12px;
		background-color: #007bff;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 1.3em;
		flex-shrink: 0;
		line-height: 1;
		min-width: 44px;
		height: 44px;
		}
		#sendButton:hover {
		background-color: #0056b3;
		}
		.close-button {
		background: none;
		border: none;
		font-size: 1.2em;
		cursor: pointer;
		color: #888;
		padding: 0;
		min-width: 28px;
		height: 28px;
		}
		.close-button:hover {
		color: #333;
		}
		</style>
		<div id="mainChatTool">
		<div class="title-bar section" style="display: none;">
		<span class="title-text"></span>
		<button id="closeButton" class="close-button" style="display: none;">✕</button>
		</div>

		<div class="top-menu section">
		<div>
		<button id="systemPromptButton" title="Settings">⚙️</button>
		<select id="modelSelect"></select>
		</div>
		<div>
		<select id="codeFilterSelect" title="Filter"></select>
		<button id="copyConversationButton" title="Copy">📋</button>
		<button id="pasteConversationButton" title="Paste">📥</button>
		<button id="clearChatButton" title="Clear">🗑️</button>
		</div>
		</div>

		<div id="systemInputContainer" class="section">
		<div class="input-group">
		<label for="apiKeyInput">API Key:</label>
		<input type="password" id="apiKeyInput" placeholder="API key" value="${this.apiKey || ''}">
		</div>
		<div class="input-group">
		<label for="systemPromptSelect">System:</label>
		<select id="systemPromptSelect"></select>
		</div>
		<div class="input-group">
		<div id="systemInput" contenteditable="true" placeholder="System prompt..."></div>
		</div>
		<div class="input-group">
		<label for="temperatureInput">Temp:</label>
		<input type="number" id="temperatureInput" value="0.7" min="0" max="1" step="0.1">
		</div>
		</div>

		<div id="rawTextOutput" class="chat-area" spellcheck="false">
		<p style="color:#888;font-size:0.9em;">🤖: How can I help you today?</p>
		</div>

		<div class="input-area-wrapper">
		<!-- 🔑 CRITICAL FIX: UPDATED PLACEHOLDER TEXT -->
		<div id="textInput" contenteditable="true" placeholder="Type your message (Ctrl+Enter or Cmd+Enter to send)..."></div>
		<button id="sendButton">➤</button>
		</div>
		</div>
		`;
	}
}

if (!customElements.get('ai-chat')) {
	customElements.define('ai-chat', AIChat);
}