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
	SAFE: 'safe',
	TR: 'tr'
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
		this.dw = 320;
		this.dh = 480;
		this.showSettings = false;
		this.negativePrompt = '';
		this.safe = true;
		this.transparent = false;
		this.filePickerInstance = null;
		this.backdropElement = null;
		this.initFilePickerCalled = false;
		
		// Zoom/Pan state
		this.scale = 1;
		this.minScale = 1;
		this.maxScale = 5;
		this.panX = 0;
		this.panY = 0;
		this.isDragging = false;
		this.startX = 0;
		this.startY = 0;
		this.startPanX = 0;
		this.startPanY = 0;
		this.touchStartDist = 0;
		this.touchStartScale = 1;
		
		this.render();
	}

	async connectedCallback() {
		this.seed = parseInt(LS.getItem(KEYS.S)) || 0;
		this.model = LS.getItem(KEYS.M) || 'flux';
		this.apiKey = LS.getItem(KEYS.K) || '';
		this.dw = parseInt(LS.getItem(KEYS.DW)) || 320;
		this.dh = parseInt(LS.getItem(KEYS.DH)) || 480;
		this.negativePrompt = '';
		this.safe = LS.getItem(KEYS.SAFE) !== 'false';
		this.transparent = LS.getItem(KEYS.TR) === 'true';

		this.w = this.dw;
		this.h = this.dh;

		await this.fetchModels();
		this.setupEvents();
		this.updateModelSel();
		this.applyVals();
		this.status('');
		
		if (!this.initFilePickerCalled) {
			this.initFilePickerCalled = true;
			this.initFilePicker();
		}
	}

	disconnectedCallback() {
		if (this.filePickerInstance && this.filePickerInstance.parentNode) {
			this.filePickerInstance.parentNode.removeChild(this.filePickerInstance);
		}
		if (this.backdropElement && this.backdropElement.parentNode) {
			this.backdropElement.parentNode.removeChild(this.backdropElement);
		}
		this.filePickerInstance = null;
		this.backdropElement = null;
	}

	initFilePicker() {
		const picker = createfilePicker();
		const wrapper = picker.querySelector('.file-picker-container-wrapper');
		
		if (!wrapper) {
			console.error('File picker init failed');
			return;
		}
		
		this.filePickerInstance = wrapper;
		
		this.filePickerInstance.style.cssText = `
			position: fixed;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			z-index: 999999;
			display: none;
		`;
		
		this.backdropElement = document.createElement('div');
		this.backdropElement.id = 'image-gen-filepicker-backdrop';
		this.backdropElement.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			width: 100vw;
			height: 100vh;
			background: rgba(0, 0, 0, 0.7);
			z-index: 999998;
			display: none;
			cursor: pointer;
		`;
		
		this.filePickerInstance.addEventListener('filepick', async (e) => {
			this.handleFilePick(e.detail.filePath);
		});
		
		this.filePickerInstance.addEventListener('cancel', () => {
			this.hideFilePicker();
			this.status('Save cancelled', 'info');
		});
		
		this.filePickerInstance.addEventListener('close', () => {
			this.hideFilePicker();
			this.status('Save cancelled', 'info');
		});
		
		this.backdropElement.onclick = () => {
			this.hideFilePicker();
			this.status('Save cancelled', 'info');
		};
		
		document.body.appendChild(this.backdropElement);
		document.body.appendChild(this.filePickerInstance);
		
		console.log('✅ File picker initialized successfully');
	}

	showFilePicker() {
		if (!this.filePickerInstance || !this.backdropElement) return;
		this.backdropElement.style.display = 'block';
		this.filePickerInstance.style.display = 'block';
		console.log('📁 Showing file picker (state preserved)');
	}

	hideFilePicker() {
		if (this.filePickerInstance && this.backdropElement) {
			this.backdropElement.style.display = 'none';
			this.filePickerInstance.style.display = 'none';
			console.log('🔒 File picker hidden (state preserved)');
		}
	}

	handleFilePick(filePath) {
		this.hideFilePicker();
		console.log(`💾 File selected: ${filePath}`);
		
		const img = this.shadowRoot.getElementById('i');
		if (!img || !img.src || img.src === window.location.href) {
			this.status('No image to save', 'error');
			return;
		}
		
		const extMatch = filePath.toLowerCase().match(/\.(png|jpe?g|webp)$/);
		const ext = extMatch ? extMatch[1] : 'png';
		
		this.status(`Saving to ${filePath}...`, 'load');
		
		fetch(img.src)
			.then(res => res.blob())
			.then(blob => {
				if (ext === 'jpg' || ext === 'jpeg') {
					return this.convertPngToJpg(blob, 0.9);
				}
				return blob;
			})
			.then(blob => {
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
					this.status('Save cancelled', 'info');
				});
				
				xhr.open('POST', '/upload', true);
				xhr.send(formData);
			})
			.catch(err => {
				console.error('Save failed:', err);
				this.status(`Save error: ${err.message}`, 'error');
			});
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
		const transEl = s.getElementById('transparent');
		
		if (wEl) wEl.value = this.dw;
		if (hEl) hEl.value = this.dh;
		if (sEl) sEl.value = this.seed;
		if (mEl) mEl.value = this.model;
		if (negEl) negEl.value = this.negativePrompt;
		if (safeEl) safeEl.checked = this.safe;
		if (transEl) transEl.checked = this.transparent;
	}

	setupEvents() {
		const s = this.shadowRoot;
		const btn = s.getElementById('g');
		const img = s.getElementById('i');
		const imgContainer = s.getElementById('imgContainer');
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

		const wEl = s.getElementById('w');
		const hEl = s.getElementById('h');
		
		if (wEl) {
			wEl.onchange = e => {
				const val = parseInt(e.target.value) || this.dw;
				this.w = val;
			};
		}
		
		if (hEl) {
			hEl.onchange = e => {
				const val = parseInt(e.target.value) || this.dh;
				this.h = val;
			};
		}

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

		const transEl = s.getElementById('transparent');
		if (transEl) {
			transEl.onchange = e => {
				this.transparent = e.target.checked;
				LS.setItem(KEYS.TR, this.transparent);
			};
		}

		img.onload = () => {
			this.loading = false;
			btn.disabled = false;
			if (saveBtn) saveBtn.disabled = false;
			// Reset zoom when new image loads
			this.resetZoom();
		};
		img.onerror = () => {
			this.loading = false;
			this.status('Image failed', 'error');
			btn.disabled = false;
			if (saveBtn) saveBtn.disabled = true;
		};

		// ===== ZOOM/PAN EVENT LISTENERS =====
		this.setupZoomPanEvents(imgContainer, img);
	}

	setupZoomPanEvents(container, img) {
		// Prevent default touch actions for smooth panning/zooming
		container.style.touchAction = 'none';
		container.style.cursor = 'grab';
		container.style.overflow = 'hidden';
		img.style.transformOrigin = 'center center';
		img.style.willChange = 'transform';

		// Mouse wheel zoom (desktop)
		container.addEventListener('wheel', (e) => {
			e.preventDefault();
			const delta = e.deltaY < 0 ? 0.1 : -0.1;
			this.zoomAtPoint(delta, e.offsetX, e.offsetY, container);
		}, { passive: false });

		// Mouse drag pan
		container.addEventListener('mousedown', (e) => {
			if (e.button !== 0) return; // Only left click
			e.preventDefault();
			this.isDragging = true;
			this.startX = e.clientX;
			this.startY = e.clientY;
			this.startPanX = this.panX;
			this.startPanY = this.panY;
			container.style.cursor = 'grabbing';
		});

		document.addEventListener('mousemove', (e) => {
			if (!this.isDragging) return;
			e.preventDefault();
			const dx = e.clientX - this.startX;
			const dy = e.clientY - this.startY;
			this.panX = this.startPanX + dx;
			this.panY = this.startPanY + dy;
			this.applyTransform(img);
		});

		document.addEventListener('mouseup', () => {
			if (this.isDragging) {
				this.isDragging = false;
				container.style.cursor = this.scale > 1 ? 'grab' : 'default';
			}
		});

		// Touch pinch zoom
		container.addEventListener('touchstart', (e) => {
			if (e.touches.length === 2) {
				e.preventDefault();
				this.touchStartDist = this.getTouchDistance(e.touches);
				this.touchStartScale = this.scale;
				this.isDragging = false;
			} else if (e.touches.length === 1) {
				this.isDragging = true;
				this.startX = e.touches[0].clientX;
				this.startY = e.touches[0].clientY;
				this.startPanX = this.panX;
				this.startPanY = this.panY;
			}
		}, { passive: false });

		container.addEventListener('touchmove', (e) => {
			if (e.touches.length === 2 && this.touchStartDist > 0) {
				e.preventDefault();
				const currentDist = this.getTouchDistance(e.touches);
				const scaleChange = (currentDist - this.touchStartDist) * 0.005;
				const newScale = Math.min(this.maxScale, Math.max(this.minScale, this.touchStartScale + scaleChange));
				
				// Zoom at center for pinch
				const rect = container.getBoundingClientRect();
				const centerX = rect.width / 2;
				const centerY = rect.height / 2;
				this.scale = newScale;
				this.applyTransform(img);
			} else if (e.touches.length === 1 && this.isDragging) {
				e.preventDefault();
				const dx = e.touches[0].clientX - this.startX;
				const dy = e.touches[0].clientY - this.startY;
				this.panX = this.startPanX + dx;
				this.panY = this.startPanY + dy;
				this.applyTransform(img);
			}
		}, { passive: false });

		container.addEventListener('touchend', () => {
			this.isDragging = false;
			this.touchStartDist = 0;
			container.style.cursor = this.scale > 1 ? 'grab' : 'default';
		});

		// Double-click to reset zoom
		container.addEventListener('dblclick', () => {
			this.resetZoom();
		});

		// Zoom buttons (optional UI)
		const zoomInBtn = this.shadowRoot.getElementById('zoomIn');
		const zoomOutBtn = this.shadowRoot.getElementById('zoomOut');
		const resetZoomBtn = this.shadowRoot.getElementById('resetZoom');
		
		if (zoomInBtn) zoomInBtn.onclick = () => this.zoomAtPoint(0.2, container.offsetWidth/2, container.offsetHeight/2, container);
		if (zoomOutBtn) zoomOutBtn.onclick = () => this.zoomAtPoint(-0.2, container.offsetWidth/2, container.offsetHeight/2, container);
		if (resetZoomBtn) resetZoomBtn.onclick = () => this.resetZoom();
	}

	getTouchDistance(touches) {
		const dx = touches[0].clientX - touches[1].clientX;
		const dy = touches[0].clientY - touches[1].clientY;
		return Math.sqrt(dx * dx + dy * dy);
	}

	zoomAtPoint(delta, pointX, pointY, container) {
		const oldScale = this.scale;
		const newScale = Math.min(this.maxScale, Math.max(this.minScale, oldScale + delta));
		
		if (newScale === oldScale) return;
		
		// Calculate pan adjustment to zoom at cursor point
		const rect = container.getBoundingClientRect();
		const centerX = pointX - rect.left;
		const centerY = pointY - rect.top;
		
		this.panX = centerX - (centerX - this.panX) * (newScale / oldScale);
		this.panY = centerY - (centerY - this.panY) * (newScale / oldScale);
		this.scale = newScale;
		
		const img = this.shadowRoot.getElementById('i');
		this.applyTransform(img);
		
		// Update cursor based on zoom state
		container.style.cursor = newScale > 1 ? 'grab' : 'default';
	}

	applyTransform(img) {
		img.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
	}

	resetZoom() {
		this.scale = 1;
		this.panX = 0;
		this.panY = 0;
		const img = this.shadowRoot.getElementById('i');
		const container = this.shadowRoot.getElementById('imgContainer');
		if (img) this.applyTransform(img);
		if (container) container.style.cursor = 'default';
	}

	toggleSettings() {
		this.showSettings = !this.showSettings;
		const modal = this.shadowRoot.getElementById('settingsModal');
		if (modal) modal.style.display = this.showSettings ? 'flex' : 'none';
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
		
		let url = `${IMG_API}/${encodeURIComponent(prompt)}?model=${this.model}&width=${this.w}&height=${this.h}&seed=${this.seed}&nologo=true&private=true&noStore=true`;
		url += `&negative_prompt=${encodeURIComponent(this.negativePrompt?.trim() || '')}`;
		url += `&safe=${this.safe}`;
		url += `&transparent=${this.transparent}`;

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

	async saveImage() {
		this.showFilePicker();
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
			position: relative;
		}
		#ct {
			display: flex;
			flex-direction: column;
			height: 100%;
			padding: 0;
			margin: 0;
			gap: 0;
		}
		.controls-wrapper {
			display: flex;
			flex-direction: column;
			flex-shrink: 0;
			z-index: 10;
			position: relative;
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
			padding: 4px 6px;
			margin: 0;
			gap: 6px;
			align-items: center;
			justify-content: flex-start;
			min-height: 36px;
			border-bottom: 1px solid #ddd;
			background: #fff;
			position: relative;
			z-index: 10;
		}
		#g {
			background: #000;
			color: #fff;
			border: none;
			padding: 0 8px;
			margin: 0;
			height: 28px;
			font-size: 11px;
			font-weight: bold;
			min-width: 50px;
			line-height: 28px;
			cursor: pointer;
		}
		#g:disabled {
			background: #ccc;
			cursor: not-allowed;
		}
		#saveBtn {
			background: #1976D2;
			color: #fff;
			border: none;
			padding: 0 8px;
			margin: 0;
			height: 28px;
			font-size: 13px;
			min-width: 32px;
			line-height: 28px;
			cursor: pointer;
			border-radius: 3px;
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
			gap: 4px;
			height: 28px;
			white-space: nowrap;
		}
		.cg label {
			font-size: 11px;
			color: #333;
			white-space: nowrap;
			padding: 4px 6px;
			margin: 0;
			line-height: 28px;
			cursor: pointer;
			background: #f5f5f5;
			border-radius: 3px;
			user-select: none;
		}
		.cg label:hover {
			background: #e0e0e0;
		}
		.cg input,
		.cg select {
			padding: 0 4px;
			margin: 0;
			border: 1px solid #ccc;
			font: inherit;
			font-size: 11px;
			height: 28px;
			width: 60px;
			background-color: #fff;
			line-height: 28px;
			border-radius: 3px;
		}
		.cg input[type="checkbox"] {
			width: 18px;
			height: 18px;
			margin: 0;
			vertical-align: middle;
			cursor: pointer;
			accent-color: #1976D2;
		}
		.cg .checkbox-label {
			display: flex;
			align-items: center;
			gap: 5px;
			padding: 4px 8px;
			background: #f5f5f5;
			border-radius: 3px;
			cursor: pointer;
			user-select: none;
			height: 28px;
			line-height: 28px;
		}
		.cg .checkbox-label:hover {
			background: #e0e0e0;
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
			height: 28px;
			font-size: 14px;
			line-height: 28px;
			width: 36px;
			cursor: pointer;
			border-radius: 3px;
		}
		#settingsBtn:hover {
			background: #ddd;
		}
		.s {
			padding: 0;
			margin: 0;
			font-size: 10px;
			min-height: 14px;
			text-align: center;
			opacity: 0.95;
			font-weight: bold;
			line-height: 1.4;
			height: 20px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			border-bottom: 1px solid #ddd;
			background: #fff;
			position: relative;
			z-index: 10;
		}
		.s.success { background: #d4edda; color: #155724; }
		.s.error { background: #f8d7da; color: #721c24; }
		.s.load { background: #d1ecf1; color: #0c5460; }
		.s.info { background: #d1ecf1; color: #0c5460; }
		#imgContainer {
			flex-grow: 1;
			min-height: 10px;
			overflow: hidden;
			position: relative;
			z-index: 1;
			background: #f8f8f8;
			touch-action: none;
			cursor: default;
		}
		#i {
			width: 100%;
			height: 100%;
			object-fit: contain;
			background: transparent;
			border: none;
			padding: 0;
			margin: 0;
			display: block;
			position: relative;
			z-index: 1;
			transform-origin: center center;
			will-change: transform;
			user-select: none;
			-webkit-user-drag: none;
		}
		/* Zoom controls overlay */
		.zoom-controls {
			position: absolute;
			bottom: 12px;
			right: 12px;
			display: flex;
			gap: 6px;
			z-index: 20;
			background: rgba(255,255,255,0.9);
			padding: 4px;
			border-radius: 6px;
			box-shadow: 0 2px 8px rgba(0,0,0,0.15);
		}
		.zoom-controls button {
			width: 32px;
			height: 32px;
			border: none;
			background: #f5f5f5;
			border-radius: 4px;
			font-size: 16px;
			cursor: pointer;
			display: flex;
			align-items: center;
			justify-content: center;
			transition: background 0.15s;
		}
		.zoom-controls button:hover {
			background: #e0e0e0;
		}
		.zoom-controls button:active {
			background: #d0d0d0;
		}
		.zoom-hint {
			position: absolute;
			top: 12px;
			left: 50%;
			transform: translateX(-50%);
			background: rgba(0,0,0,0.7);
			color: white;
			padding: 4px 10px;
			border-radius: 12px;
			font-size: 10px;
			opacity: 0;
			transition: opacity 0.3s;
			pointer-events: none;
			z-index: 15;
			white-space: nowrap;
		}
		.zoom-hint.show {
			opacity: 1;
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
			.cs { min-height: 32px; padding: 3px 4px; gap: 4px; }
			#g { height: 24px; font-size: 10px; line-height: 24px; min-width: 45px; padding: 0 6px; }
			#saveBtn { height: 24px; font-size: 12px; min-width: 28px; }
			.cg { height: 24px; gap: 3px; }
			.cg label { font-size: 10px; padding: 3px 5px; }
			.cg input, .cg select { height: 24px; font-size: 10px; width: 50px; }
			.cg input[type="checkbox"] { width: 16px; height: 16px; }
			#settingsBtn { height: 24px; font-size: 13px; line-height: 24px; width: 32px; }
			.s { height: 18px; line-height: 1.3; }
			#imgContainer { margin-top: 0; }
			#settingsContent { width: 90%; max-width: 240px; border-radius: 0; }
			#settingsHeader { height: 16px; padding: 0.5px 1px; }
			#settingsHeader strong { font-size: 9px; line-height: 16px; padding-left: 1px; }
			#closeSettings { font-size: 13px; line-height: 16px; width: 18px; }
			#settingsGroup { padding: 0.5px; }
			.setting-row { height: 16px; }
			.setting-row label { min-width: 40px; font-size: 8px; line-height: 16px; }
			.setting-row input { height: 16px; font-size: 9px; line-height: 16px; }
			#saveSettingsBtn { height: 16px; font-size: 10px; }
			.zoom-controls { bottom: 8px; right: 8px; }
			.zoom-controls button { width: 28px; height: 28px; font-size: 14px; }
		}
		</style>
		<div id="ct">
			<div class="controls-wrapper">
				<textarea id="p" placeholder="Describe image..."></textarea>
				<textarea id="neg" placeholder="Negative prompt (what to avoid)..."></textarea>
				<div class="cs">
					<button id="g">Gen</button>
					<button id="saveBtn" title="Save Image to File">💾</button>
					<div class="cg"><label>W</label><input id="w" type="number" min="64" max="2048"></div>
					<div class="cg"><label>H</label><input id="h" type="number" min="64" max="2048"></div>
					<div class="cg"><label>S</label><input id="s" type="number" min="0" max="1000000000"></div>
					<div class="cg"><label>M</label><select id="m"></select></div>
					<div class="cg"><label class="checkbox-label"><input type="checkbox" id="safe"> Safe</label></div>
					<div class="cg"><label class="checkbox-label"><input type="checkbox" id="transparent"> Transparent</label></div>
					<button id="settingsBtn">⚙️</button>
				</div>
				<div id="st" class="s" onclick="this.textContent=''"></div>
			</div>
			<div id="imgContainer">
				<img id="i" alt="Generated Image">
				<div class="zoom-hint" id="zoomHint">🔍 Pinch/scroll to zoom • Drag to pan • Double-click to reset</div>
				<div class="zoom-controls">
					<button id="zoomOut" title="Zoom out">−</button>
					<button id="resetZoom" title="Reset zoom">⟲</button>
					<button id="zoomIn" title="Zoom in">+</button>
				</div>
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

		// Show zoom hint briefly after render
		setTimeout(() => {
			const hint = this.shadowRoot.getElementById('zoomHint');
			if (hint) {
				hint.classList.add('show');
				setTimeout(() => hint.classList.remove('show'), 4000);
			}
		}, 500);
	}
}

customElements.define('image-generator', ImageGenerator);