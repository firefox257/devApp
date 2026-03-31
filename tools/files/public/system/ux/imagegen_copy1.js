// ./ux/imagegen.js
const IMG_API = "https://gen.pollinations.ai/image";
const MODELS_URL = "https://gen.pollinations.ai/image/models";
const LS = localStorage;
const KEYS = {
	S: 's',
	M: 'm',
	K: 'k',
	DW: 'dw',
	DH: 'dh',
	MDLS: 'mdls'
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
		this.dw = 320; // Default width
		this.dh = 480; // Default height
		this.showSettings = false;
		this.render();
	}

	async connectedCallback() {
		this.seed = parseInt(LS.getItem(KEYS.S)) || 0;
		this.model = LS.getItem(KEYS.M) || 'flux';
		this.apiKey = LS.getItem(KEYS.K) || '';
		this.dw = parseInt(LS.getItem(KEYS.DW)) || 320;
		this.dh = parseInt(LS.getItem(KEYS.DH)) || 480;

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
		this.shadowRoot.getElementById('w').value = this.dw;
		this.shadowRoot.getElementById('h').value = this.dh;
		this.shadowRoot.getElementById('s').value = this.seed;
		this.shadowRoot.getElementById('m').value = this.model;
	}

	setupEvents() {
		const s = this.shadowRoot;
		const btn = s.getElementById('g');
		const img = s.getElementById('i');

		btn.onclick = () => this.gen();
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

		// Removed 'readonly' from these input types
		['w', 'h', 's'].forEach(id => {
				s.getElementById(id).onchange = e => {
					const val = parseInt(e.target.value) || { w: this.dw, h: this.dh, s: 0 }[id];
					if (id === 'w') {
						this.w = val;
					} else if (id === 'h') {
						this.h = val;
					} else { // id === 's'
						this.seed = val;
						LS.setItem(KEYS.S, val);
					}
				};
			});

		s.getElementById('m').onchange = e => {
			this.model = e.target.value;
			LS.setItem(KEYS.M, this.model);
		};

		img.onload = () => {
			this.loading = false;
			btn.disabled = false;
		};
		img.onerror = () => {
			this.loading = false;
			this.status('Image failed', 'error');
			btn.disabled = false;
		};
	}

	toggleSettings() {
		this.showSettings = !this.showSettings;
		this.shadowRoot.getElementById('settingsModal').style.display = this.showSettings ? 'flex' : 'none';
		if (this.showSettings) {
			this.shadowRoot.getElementById('apiKeyInput').value = this.apiKey;
			this.shadowRoot.getElementById('defaultWidth').value = this.dw;
			this.shadowRoot.getElementById('defaultHeight').value = this.dh;
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

		LS.setItem(KEYS.DW, dw);
		LS.setItem(KEYS.DH, dh);
		this.dw = dw;
		this.dh = dh;

		this.w = dw;
		this.h = dh;
		this.applyVals();

		this.toggleSettings();
		this.status('✓ Settings saved', 'success');
	}

	status(msg, type = '') {
		const el = this.shadowRoot.getElementById('st');
		el.textContent = msg;
		el.className = `s ${type}`;
		if (msg) setTimeout(() => el.textContent = '', 3000);
	}

	valid() {
		if (!this.apiKey) return this.status('API key needed', 'error');
		const prompt = this.shadowRoot.getElementById('p').value.trim();
		if (!prompt) return this.status('Prompt required', 'error');
		if (this.seed < 0 || this.seed > 1e9) return this.status('Seed 0-1B', 'error');
		if (!this.models.includes(this.model)) return this.status('Invalid model', 'error');
		return true;
	}

	async gen() {
		if (this.loading || !this.valid()) return;

		this.loading = true;
		const btn = this.shadowRoot.getElementById('g');
		btn.disabled = true;
		this.status('Generating...', 'load');

		this.seed = (this.seed + 1) % 1e9;
		this.shadowRoot.getElementById('s').value = this.seed;
		LS.setItem(KEYS.S, this.seed);

		const prompt = this.shadowRoot.getElementById('p').value.trim();
		const url = `${IMG_API}/${encodeURIComponent(prompt)}?model=${this.model}&width=${this.dw}&height=${this.dh}&seed=${this.seed}&nologo=true&private=true&noStore=true`;

		try {
			const res = await fetch(url, {
					headers: { 'Authorization': `Bearer ${this.apiKey}` }
				});

			if (!res.ok) {
				const errText = await res.text();
				throw new Error(`HTTP ${res.status}: ${errText.substring(0, 50)}`);
			}

			const blob = await res.blob();
			this.shadowRoot.getElementById('i').src = URL.createObjectURL(blob);
			this.status('Done', 'success');
		} catch (e) {
			console.error('Generation failed:', e);
			this.status(`Error: ${e.message.split('\n')[0]}`, 'error');
			btn.disabled = false;
			this.loading = false;
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
			font-family: system-ui, sans-serif;
			background: #fff;
			color: #000;
			overflow: hidden;
			font-size: 11px;
			border: 1px solid #ccc; /* Adjust color and thickness as needed */
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
			height: 8vh; /* Increased height from 5vh to 8vh */
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
			height: 24px; /* Minimal height for control bar */
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
			width: 40px;
			background-color: #fff;
			line-height: 24px;
		}
		#settingsBtn {
			background: #eee;
			color: #333;
			border: none;
			padding: 0;
			margin: 0 0 0 auto; /* Push to right */
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

		/* Settings Modal - No Title Bar */
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
			border-radius: 0; /* NO rounded corners */
			width: 90%;
			max-width: 260px;
			overflow: hidden;
			box-shadow: 0 0 2px rgba(0,0,0,0.1);
		}
		#settingsHeader {
			display: flex;
			justify-content: space-between;
			padding: 1px 2px; /* Minimal padding */
			background: transparent; /* Removed bar background */
			border-bottom: none; /* Removed bottom border */
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
			:host {
				border: 1px solid #ccc; /* Ensure border is applied to host in media query too */
			}
			#ct { padding: 0; margin font-size: 9px; padding: 0 1px; }
			#p { height: 6vh; min-height: 20px; padding: 0; } /* Adjusted for smaller screens */
			.cs { height: 20px; }
			#g { height: 20px; font-size: 9px; line-height: 20px; min-width: 35px; }
			.cg { height: 20px; }
			.cg label { font-size: 8px; padding: 0 0.5px; line-height: 20px; }
			.cg input, .cg select { height: 20px; font-size: 9px; width: 35px; line-height: 20px; }
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
			<div class="cs">
				<button id="g">Gen</button>
				<div class="cg"><label>W</label><input id="w" type="number"></div> <!-- Removed readonly -->
				<div class="cg"><label>H</label><input id="h" type="number"></div> <!-- Removed readonly -->
				<div class="cg"><label>S</label><input id="s" type="number" min="0" max="1000000000"></div> <!-- Removed readonly -->
				<div class="cg"><label>M</label><select id="m"></select></div>
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