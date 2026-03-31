// ./ux/imagegen.js
import { createfilePicker } from './filePicker.js';
import { api } from '/system/js/apiCalls.js';

const IMG_API = "https://gen.pollinations.ai/image";
const MODELS_URL = "https://gen.pollinations.ai/image/models";
const LS = localStorage;
const KEYS = {
	S: 's',
	M: 'm',
	K: 'k',
	DW: 'dw',
	DH: 'dh',
	MDLS: 'mdls',
	SAFE: 'safe'
};

class ImageGenerator extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.seed = 0;
		this.model = 'flux';
		this.models = [];
		this.loading = false;
		this.apiKey = '';
		this.dw = 320;  // Default width (from settings)
		this.dh = 480;  // Default height (from settings)
		this.showSettings = false;
		this.negativePrompt = '';
		this.safe = true;
		this.render();
	}

	async connectedCallback() {
		// ✅ Load persistent settings from localStorage
		this.seed = parseInt(LS.getItem(KEYS.S)) || 0;
		this.model = LS.getItem(KEYS.M) || 'flux';
		this.apiKey = LS.getItem(KEYS.K) || '';
		this.dw = parseInt(LS.getItem(KEYS.DW)) || 320;  // ✅ From settings only
		this.dh = parseInt(LS.getItem(KEYS.DH)) || 480;  // ✅ From settings only
		this.negativePrompt = '';
		this.safe = LS.getItem(KEYS.SAFE) !== 'false';

		this.w = this.dw;
		this.h = this.dh;

		await this.fetchModels();
		this.setupEvents();
		this.updateModelSel();
		this.applyVals();
		this.status('');
	}

	async fetchModels() {
		const cached = LS.getItem(KEYS.MDLS);
		if (cached) {
			try {
				this.models = JSON.parse(cached);
				this.updateModelSel();
				const hasModel = this.models.includes(this.model);
				if (!hasModel && this.models.length > 0) {
					this.model = this.models.includes('flux') ? 'flux' : (this.models[0] || 'flux');
					LS.setItem(KEYS.M, this.model);
				}
			} catch (e) {
				LS.removeItem(KEYS.MDLS);
			}
		}

		try {
			const headers = { 'Content-Type': 'application/json' };
			if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

			const res = await fetch(MODELS_URL, { headers });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);

			const data = await res.json();
			const arr = Array.isArray(data) ? data : data;

			this.models = arr
			.filter(m => m.output_modalities?.includes('image'))
			.map(m => m.name);

			if (!this.models.includes(this.model)) {
				this.model = this.models.includes('flux') ? 'flux' : (this.models[0] || 'flux');
			}

			this.updateModelSel();
			LS.setItem(KEYS.MDLS, JSON.stringify(this.models));
			LS.setItem(KEYS.M, this.model);
		} catch (e) {
			console.warn('Models fetch failed:', e);
			this.models = ['flux', 'turbo'];
			this.updateModelSel();
		}
	}

	updateModelSel() {
		const sel = this.shadowRoot.getElementById('m');
		if (!sel) return;
		sel.innerHTML = '';
		this.models.forEach(name => {
				const opt = document.createElement('option');
				opt.value = name;
				opt.textContent = name.charAt(0).toUpperCase() + name.slice(1);
				sel.appendChild(opt);
			});
		sel.value = this.models.includes(this.model) ? this.model : (this.models[0] || 'flux');
		if (this.model !== sel.value) {
			this.model = sel.value;
			LS.setItem(KEYS.M, this.model);
		}
	}

	applyVals() {
		const s = this.shadowRoot;
		const wEl = s.getElementById('w');
		const hEl = s.getElementById('h');
		const sEl = s.getElementById('s');
		const mEl = s.getElementById('m');
		const negEl = s.getElementById('neg');
		const safeEl = s.getElementById('safe');
		
		if (wEl) wEl.value = this.dw;
		if (hEl) hEl.value = this.dh;
		if (sEl) sEl.value = this.seed;
		if (mEl) mEl.value = this.model;
		if (negEl) negEl.value = this.negativePrompt;
		if (safeEl) safeEl.checked = this.safe;
	}

	setupEvents() {
		const s = this.shadowRoot;
		const btn = s.getElementById('g');
		const img = s.getElementById('i');
		const saveBtn = s.getElementById('saveBtn');

		btn.onclick = () => this.gen();
		
		if (saveBtn) {
			saveBtn.onclick = () => this.saveImage();
		}

		s.getElementById('p').onkeydown = e => {
			if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
				e.preventDefault();
				this.gen();
			}
		};

		s.getElementById('st').onclick = () => this.status('');
		s.getElementById('settingsBtn').onclick = () => this.toggleSettings();
		s.getElementById('closeSettings').onclick = () => this.toggleSettings();
		s.getElementById('saveSettingsBtn').onclick = () => this.saveSettings();

		// ✅ FIX: Width/Height inputs update session values ONLY (this.w, this.h)
		// They do NOT change the persistent defaults (this.dw, this.dh)
		const wEl = s.getElementById('w');
		const hEl = s.getElementById('h');
		
		if (wEl) {
			wEl.onchange = e => {
				const val = parseInt(e.target.value) || this.dw;
				this.w = val;  // ✅ Session only, NOT saved to localStorage
			};
		}
		
		if (hEl) {
			hEl.onchange = e => {
				const val = parseInt(e.target.value) || this.dh;
				this.h = val;  // ✅ Session only, NOT saved to localStorage
			};
		}

		// Seed input
		const sEl = s.getElementById('s');
		if (sEl) {
			sEl.onchange = e => {
				const val = parseInt(e.target.value) || 0;
				this.seed = val;
				LS.setItem(KEYS.S, val);
			};
		}

		const mEl = s.getElementById('m');
		if (mEl) {
			mEl.onchange = e => {
				this.model = e.target.value;
				LS.setItem(KEYS.M, this.model);
			};
		}

		const negEl = s.getElementById('neg');
		if (negEl) {
			negEl.oninput = e => {
				this.negativePrompt = e.target.value;
			};
		}

		const safeEl = s.getElementById('safe');
		if (safeEl) {
			safeEl.onchange = e => {
				this.safe = e.target.checked;
				LS.setItem(KEYS.SAFE, this.safe);
			};
		}

		img.onload = () => {
			this.loading = false;
			btn.disabled = false;
			if (saveBtn) saveBtn.disabled = false;
		};
		img.onerror = () => {
			this.loading = false;
			this.status('Image failed', 'error');
			btn.disabled = false;
			if (saveBtn) saveBtn.disabled = true;
		};
	}

	toggleSettings() {
		this.showSettings = !this.showSettings;
		const modal = this.shadowRoot.getElementById('settingsModal');
		if (modal) modal.style.display = this.showSettings ? 'flex' : 'none';
		if (this.showSettings) {
			// ✅ Show current persistent defaults in settings modal
			this.shadowRoot.getElementById('apiKeyInput').value = this.apiKey;
			this.shadowRoot.getElementById('defaultWidth').value = this.dw;  // ✅ Persistent default
			this.shadowRoot.getElementById('defaultHeight').value = this.dh;  // ✅ Persistent default
		}
	}

	saveSettings() {
		const key = this.shadowRoot.getElementById('apiKeyInput').value.trim();
		const dw = parseInt(this.shadowRoot.getElementById('defaultWidth').value) || 320;
		const dh = parseInt(this.shadowRoot.getElementById('defaultHeight').value) || 480;

		if (key) {
			LS.setItem(KEYS.K, key);
			this.apiKey = key;
			this.fetchModels();
		} else {
			LS.removeItem(KEYS.K);
			this.apiKey = '';
		}

		// ✅ ONLY Settings modal saves to localStorage for defaults
		LS.setItem(KEYS.DW, dw);
		LS.setItem(KEYS.DH, dh);
		this.dw = dw;  // ✅ Update persistent default
		this.dh = dh;  // ✅ Update persistent default

		this.w = dw;  // ✅ Also update session values
		this.h = dh;  // ✅ Also update session values
		this.applyVals();  // ✅ Refresh UI to show new defaults

		this.toggleSettings();
		this.status('✓ Settings saved', 'success');
	}

	status(msg, type = '') {
		const el = this.shadowRoot.getElementById('st');
		if (!el) return;
		el.textContent = msg;
		el.className = `s ${type}`;
		if (msg) setTimeout(() => el.textContent = '', 3000);
	}

	valid() {
		if (!this.apiKey) return this.status('API key needed', 'error');
		const prompt = this.shadowRoot.getElementById('p')?.value.trim();
		if (!prompt) return this.status('Prompt required', 'error');
		if (this.seed < 0 || this.seed > 1e9) return this.status('Seed 0-1B', 'error');
		if (!this.models.includes(this.model)) return this.status('Invalid model', 'error');
		return true;
	}

	async gen() {
		if (this.loading || !this.valid()) return;

		this.loading = true;
		const btn = this.shadowRoot.getElementById('g');
		const saveBtn = this.shadowRoot.getElementById('saveBtn');
		if (btn) btn.disabled = true;
		if (saveBtn) saveBtn.disabled = true;
		this.status('Generating...', 'load');

		this.seed = (this.seed + 1) % 1e9;
		const sEl = this.shadowRoot.getElementById('s');
		if (sEl) sEl.value = this.seed;
		LS.setItem(KEYS.S, this.seed);

		const prompt = this.shadowRoot.getElementById('p').value.trim();
		
		// ✅ Use this.w and this.h for generation (session values)
		let url = `${IMG_API}/${encodeURIComponent(prompt)}?model=${this.model}&width=${this.w}&height=${this.h}&seed=${this.seed}&nologo=true&private=true&noStore=true`;
		url += `&negative_prompt=${encodeURIComponent(this.negativePrompt?.trim() || '')}`;
		url += `&safe=${this.safe}`;

		try {
			const headers = { 'Authorization': `Bearer ${this.apiKey}` };
			const res = await fetch(url, { headers });

			if (!res.ok) {
				const errText = await res.text();
				throw new Error(`HTTP ${res.status}: ${errText.substring(0, 50)}`);
			}

			const blob = await res.blob();
			const img = this.shadowRoot.getElementById('i');
			if (img) {
				if (img.src && img.src.startsWith('blob:')) {
					URL.revokeObjectURL(img.src);
				}
				img.src = URL.createObjectURL(blob);
			}
			this.status('Done', 'success');
			if (saveBtn) saveBtn.disabled = false;
		} catch (e) {
			console.error('Generation failed:', e);
			this.status(`Error: ${e.message.split('\n')[0]}`, 'error');
			if (btn) btn.disabled = false;
			if (saveBtn) saveBtn.disabled = true;
			this.loading = false;
		}
	}

	/**
	 * Converts a PNG blob to JPG format using canvas
	 * @param {Blob} blob - The source PNG blob
	 * @param {number} quality - JPEG quality (0-1)
	 * @returns {Promise<Blob>} - The converted JPG blob
	 */
	async convertPngToJpg(blob, quality = 0.9) {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => {
				const canvas = document.createElement('canvas');
				canvas.width = img.width;
				canvas.height = img.height;
				const ctx = canvas.getContext('2d');
				ctx.fillStyle = '#ffffff';
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				ctx.drawImage(img, 0, 0);
				canvas.toBlob(
					(result) => result ? resolve(result) : reject(new Error('Conversion failed')),
					'image/jpeg',
					quality
				);
				URL.revokeObjectURL(img.src);
			};
			img.onerror = reject;
			img.src = URL.createObjectURL(blob);
		});
	}

	/**
	 * Saves the generated image as binary using FormData upload
	 * Format is determined by file extension in the selected path.
	 */
	async saveImage() {
		const img = this.shadowRoot.getElementById('i');
		if (!img || !img.src || img.src === window.location.href) {
			this.status('No image to save', 'error');
			return;
		}

		const picker = createfilePicker();
		const pickerInstance = picker.querySelector('.file-picker-container-wrapper');
		
		if (!pickerInstance) {
			this.status('File picker init failed', 'error');
			return;
		}
		
		pickerInstance['dom.buttonText'] = 'Use';
		pickerInstance.filePath = `/image_${Date.now()}.png`;

		pickerInstance.addEventListener('filepick', async (e) => {
			const filePath = e.detail.filePath;
			
			try {
				const extMatch = filePath.toLowerCase().match(/\.(png|jpe?g|webp)$/);
				const ext = extMatch ? extMatch[1] : 'png';
				
				this.status(`Saving to ${filePath}...`, 'load');
				
				const response = await fetch(img.src);
				let blob = await response.blob();
				
				if (ext === 'jpg' || ext === 'jpeg') {
					blob = await this.convertPngToJpg(blob, 0.9);
				}
				
				const fileName = filePath.split('/').pop();
				const formData = new FormData();
				formData.append('file', blob, fileName);
				formData.append('path', filePath);
				
				const xhr = new XMLHttpRequest();
				
				xhr.upload.addEventListener('progress', (event) => {
					if (event.lengthComputable) {
						const percentComplete = Math.round((event.loaded / event.total) * 100);
						this.status(`Uploading: ${percentComplete}%`, 'load');
					}
				});
				
				xhr.addEventListener('load', () => {
					if (xhr.status === 200) {
						this.status(`✓ Saved: ${fileName}`, 'success');
					} else {
						const errorText = xhr.responseText || 'Unknown error';
						this.status(`Save failed: ${errorText}`, 'error');
					}
				});
				
				xhr.addEventListener('error', () => {
					this.status('Network error during save', 'error');
				});
				
				xhr.addEventListener('abort', () => {
					this.status('Save cancelled', 'error');
				});
				
				xhr.open('POST', '/upload', true);
				xhr.send(formData);
				
			} catch (err) {
				console.error('Save failed:', err);
				this.status(`Save error: ${err.message}`, 'error');
			} finally {
				if (picker.parentNode) {
					picker.parentNode.removeChild(picker);
				}
			}
		});
		
		pickerInstance.addEventListener('cancel', () => {
			if (picker.parentNode) {
				picker.parentNode.removeChild(picker);
			}
			this.status('Save cancelled', 'error');
		});
		
		document.body.appendChild(picker);
	}

	render() {
		this.shadowRoot.innerHTML = `
		<style>
		:host {
			display: flex;
			flex-direction: column;
			width: 100%;
			height: 100%;
			font-family: system-ui, sans-serif;
			background: #fff;
			color: #000;
			overflow: hidden;
			font-size: 11px;
			border: 1px solid #ccc;
		}
		#ct {
			display: flex;
			flex-direction: column;
			height: 100%;
			padding: 0;
			margin: 0;
			gap: 0;
		}
		#p {
			width: 100%;
			height: 8vh;
			min-height: 25px;
			padding: 0;
			margin: 0;
			border: none;
			font: inherit;
			box-sizing: border-box;
			background-color: #fff;
		}
		.cs {
			display: flex;
			flex-wrap: wrap;
			padding: 0;
			margin: 0;
			gap: 0;
			align-items: center;
			justify-content: flex-start;
			height: 24px;
		}
		#g {
			background: #000;
			color: #fff;
			border: none;
			padding: 0;
			margin: 0;
			height: 24px;
			font-size: 10px;
			font-weight: bold;
			min-width: 40px;
			line-height: 24px;
		}
		#g:disabled {
			background: #ccc;
			cursor: not-allowed;
		}
		#saveBtn {
			background: #1976D2;
			color: #fff;
			border: none;
			padding: 0;
			margin: 0 2px;
			height: 24px;
			font-size: 12px;
			min-width: 24px;
			line-height: 24px;
			cursor: pointer;
			border-radius: 2px;
		}
		#saveBtn:disabled {
			background: #ccc;
			cursor: not-allowed;
		}
		#saveBtn:hover:not(:disabled) {
			background: #2196F3;
		}
		.cg {
			display: flex;
			align-items: center;
			padding: 0;
			margin: 0;
			gap: 0;
			height: 24px;
		}
		.cg label {
			font-size: 9px;
			color: #555;
			white-space: nowrap;
			padding: 0 1px;
			margin: 0;
			line-height: 24px;
		}
		.cg input,
		.cg select {
			padding: 0;
			margin: 0;
			border: none;
			font: inherit;
			font-size: 10px;
			height: 24px;
			width: 50px;
			background-color: #fff;
			line-height: 24px;
		}
		.cg input[type="checkbox"] {
			width: auto;
			height: 14px;
			margin: 0 2px;
			vertical-align: middle;
		}
		#neg {
			width: 100%;
			height: 6vh;
			min-height: 20px;
			padding: 0;
			margin: 0;
			border: none;
			border-top: 1px solid #eee;
			font: inherit;
			font-size: 10px;
			box-sizing: border-box;
			background-color: #fff;
		}
		#settingsBtn {
			background: #eee;
			color: #333;
			border: none;
			padding: 0;
			margin: 0 0 0 auto;
			height: 24px;
			font-size: 12px;
			line-height: 24px;
			width: 30px;
		}
		.s {
			padding: 0;
			margin: 0;
			font-size: 9px;
			min-height: 12px;
			text-align: center;
			opacity: 0.95;
			font-weight: bold;
			line-height: 1.3;
			height: 16px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.s.success { background: #d4edda; color: #155724; }
		.s.error { background: #f8d7da; color: #721c24; }
		.s.load { background: #d1ecf1; color: #0c5460; }
		#i {
			width: 100%;
			height: 100%;
			object-fit: contain;
			background: #f8f8f8;
			border: none;
			padding: 0;
			margin: 0;
		}
		#settingsModal {
			display: none;
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background: rgba(0,0,0,0.1);
			z-index: 1000;
			align-items: center;
			justify-content: center;
		}
		#settingsContent {
			background: #fff;
			border-radius: 0;
			width: 90%;
			max-width: 260px;
			overflow: hidden;
			box-shadow: 0 0 2px rgba(0,0,0,0.1);
		}
		#settingsHeader {
			display: flex;
			justify-content: space-between;
			padding: 1px 2px;
			background: transparent;
			border-bottom: none;
			height: 18px;
		}
		#settingsHeader strong {
			font-size: 10px;
			font-weight: bold;
			color: #333;
			line-height: 18px;
			padding-left: 2px;
		}
		#closeSettings {
			background: transparent;
			color: #888;
			border: none;
			padding: 0;
			margin: 0;
			font-size: 14px;
			font-weight: bold;
			cursor: pointer;
			line-height: 18px;
			width: 20px;
		}
		#settingsGroup {
			padding: 1px;
			margin: 0;
		}
		.setting-row {
			display: flex;
			padding: 0;
			margin: 0;
			gap: 0;
			align-items: center;
			height: 18px;
		}
		.setting-row label {
			font-size: 9px;
			font-weight: 500;
			min-width: 50px;
			color: #555;
			padding: 0 1px;
			margin: 0;
			line-height: 18px;
		}
		.setting-row input {
			flex: 1;
			padding: 0;
			margin: 0;
			border: none;
			font: inherit;
			font-size: 10px;
			height: 18px;
			background-color: #fff;
			line-height: 18px;
		}
		.setting-row input[type="checkbox"] {
			width: auto;
			height: 14px;
			margin: 0 2px;
		}
		#saveSettingsBtn {
			width: 100%;
			background: #000;
			color: #fff;
			border: none;
			padding: 0;
			margin: 0;
			font-size: 11px;
			font-weight: bold;
			cursor: pointer;
			height: 18px;
			line-height: 18px;
		}
		@media (max-width: 360px) {
			:host { border: 1px solid #ccc; }
			#ct { font-size: 9px; padding: 0 1px; }
			#p { height: 6vh; min-height: 20px; padding: 0; }
			.cs { height: 20px; }
			#g { height: 20px; font-size: 9px; line-height: 20px; min-width: 35px; }
			#saveBtn { height: 20px; font-size: 10px; min-width: 20px; }
			.cg { height: 20px; }
			.cg label { font-size: 8px; padding: 0 0.5px; line-height: 20px; }
			.cg input, .cg select { height: 20px; font-size: 9px; width: 45px; line-height: 20px; }
			#settingsBtn { height: 20px; font-size: 11px; line-height: 20px; width: 25px; }
			.s { height: 14px; line-height: 1.2; }
			#settingsContent { width: 90%; max-width: 240px; border-radius: 0; }
			#settingsHeader { height: 16px; padding: 0.5px 1px; }
			#settingsHeader strong { font-size: 9px; line-height: 16px; padding-left: 1px; }
			#closeSettings { font-size: 13px; line-height: 16px; width: 18px; }
			#settingsGroup { padding: 0.5px; }
			.setting-row { height: 16px; }
			.setting-row label { min-width: 40px; font-size: 8px; line-height: 16px; }
			.setting-row input { height: 16px; font-size: 9px; line-height: 16px; }
			#saveSettingsBtn { height: 16px; font-size: 10px; }
		}
		</style>
		<div id="ct">
			<textarea id="p" placeholder="Describe image..."></textarea>
			<textarea id="neg" placeholder="Negative prompt (what to avoid)..."></textarea>
			<div class="cs">
				<button id="g">Gen</button>
				<button id="saveBtn" title="Save Image to File">💾</button>
				<div class="cg"><label>W</label><input id="w" type="number" min="64" max="2048"></div>
				<div class="cg"><label>H</label><input id="h" type="number" min="64" max="2048"></div>
				<div class="cg"><label>S</label><input id="s" type="number" min="0" max="1000000000"></div>
				<div class="cg"><label>M</label><select id="m"></select></div>
				<div class="cg"><label><input type="checkbox" id="safe"> Safe</label></div>
				<button id="settingsBtn">⚙️</button>
			</div>
			<div id="st" class="s" onclick="this.textContent=''"></div>
			<div style="flex-grow:1;min-height:10px;overflow:hidden;">
				<img id="i" alt="Generated Image">
			</div>
			<div id="settingsModal">
				<div id="settingsContent">
					<div id="settingsHeader">
						<strong>Settings</strong>
						<button id="closeSettings">✕</button>
					</div>
					<div id="settingsGroup">
						<div class="setting-row">
							<label>API Key:</label>
							<input type="password" id="apiKeyInput" placeholder="Key">
						</div>
						<div class="setting-row">
							<label>Width:</label>
							<input type="number" id="defaultWidth" placeholder="320">
						</div>
						<div class="setting-row">
							<label>Height:</label>
							<input type="number" id="defaultHeight" placeholder="480">
						</div>
						<div style="font-size:9px;color:#777;margin-top:1px">
							<a href="https://pollinations.ai" target="_blank" style="color:#007bff;text-decoration:none">Get Key</a>
						</div>
					</div>
					<button id="saveSettingsBtn">Save</button>
				</div>
			</div>
		</div>`;
	}
}

customElements.define('image-generator', ImageGenerator);