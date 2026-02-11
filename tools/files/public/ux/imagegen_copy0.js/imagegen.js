// ./ux/imagegen.js
const IMG_API = "https://gen.pollinations.ai/image";
const MODELS_URL = "https://gen.pollinations.ai/image/models";
const LS = localStorage;
const KEYS = {
  W: 'w',
  H: 'h',
  S: 's',
  M: 'm',
  P: 'p',
  K: 'k',
  DW: 'dw',
  DH: 'dh',
  MDLS: 'mdls'
};

class ImageGenerator extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.w = 320;
    this.h = 480;
    this.seed = 0;
    this.model = 'flux';
    this.models = [];
    this.loading = false;
    this.apiKey = '';
    this.dw = 320;
    this.dh = 480;
    this.showSettings = false;
    this.render();
  }

  async connectedCallback() {
    this.w = parseInt(LS.getItem(KEYS.W)) || this.dw;
    this.h = parseInt(LS.getItem(KEYS.H)) || this.dh;
    this.seed = parseInt(LS.getItem(KEYS.S)) || 0;
    this.model = LS.getItem(KEYS.M) || 'flux';
    this.apiKey = LS.getItem(KEYS.K) || '';
    this.dw = parseInt(LS.getItem(KEYS.DW)) || 320;
    this.dh = parseInt(LS.getItem(KEYS.DH)) || 480;
    
    const prompt = LS.getItem(KEYS.P);
    if (prompt) this.shadowRoot.getElementById('p').value = prompt;
    
    await this.fetchModels();
    this.setupEvents();
    this.updateModelSel();
    this.applyVals();
    this.status('');
  }

  async fetchModels() {
    // Load cached models first for instant display
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

    // Fetch fresh models if API key available
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
      
      const res = await fetch(MODELS_URL, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      const arr = Array.isArray(data) ? data : data;
      
      // Filter image models only
      this.models = arr
        .filter(m => m.output_modalities?.includes('image'))
        .map(m => m.name);
      
      // Validate current model selection
      if (!this.models.includes(this.model)) {
        this.model = this.models.includes('flux') ? 'flux' : (this.models[0] || 'flux');
      }
      
      this.updateModelSel();
      LS.setItem(KEYS.MDLS, JSON.stringify(this.models));
      LS.setItem(KEYS.M, this.model);
    } catch (e) {
      console.warn('Models fetch failed:', e);
      // Fallback to minimal defaults
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
  }

  applyVals() {
    this.shadowRoot.getElementById('w').value = this.w;
    this.shadowRoot.getElementById('h').value = this.h;
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
    s.getElementById('p').oninput = e => LS.setItem(KEYS.P, e.target.value);
    s.getElementById('st').onclick = () => this.status('');
    s.getElementById('settingsBtn').onclick = () => this.toggleSettings();
    s.getElementById('closeSettings').onclick = () => this.toggleSettings();
    s.getElementById('saveSettingsBtn').onclick = () => this.saveSettings();
    
    ['w', 'h', 's'].forEach(id => {
      s.getElementById(id).onchange = e => {
        const val = parseInt(e.target.value) || { w: this.dw, h: this.dh, s: 0 }[id];
        this[id === 'w' ? 'w' : id === 'h' ? 'h' : 'seed'] = val;
        LS.setItem(KEYS[id.toUpperCase()], val);
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
      // Refresh models with new API key
      this.fetchModels();
    } else {
      LS.removeItem(KEYS.K);
      this.apiKey = '';
    }
    
    LS.setItem(KEYS.DW, dw);
    LS.setItem(KEYS.DH, dh);
    this.dw = dw;
    this.dh = dh;
    
    // Apply new defaults immediately
    this.w = dw;
    this.h = dh;
    this.applyVals();
    LS.setItem(KEYS.W, dw);
    LS.setItem(KEYS.H, dh);
    
    this.toggleSettings();
    this.status('✓ Settings saved', 'success');
  }

  status(msg, type = '') {
    const el = this.shadowRoot.getElementById('st');
    el.textContent = msg;
    el.className = `s ${type}`;
    if (msg) setTimeout(() => this.status(''), 5000);
  }

  valid() {
    if (!this.apiKey) return this.status('⚙️ Set API key', 'error');
    const prompt = this.shadowRoot.getElementById('p').value.trim();
    if (!prompt) return this.status('✏️ Prompt', 'error');
    // Width/height constraints removed per requirements
    if (this.seed < 0 || this.seed > 1e9) return this.status('🔢 Seed:0-1B', 'error');
    if (!this.models.includes(this.model)) return this.status('🤖 Model', 'error');
    return true;
  }

  async gen() {
    if (this.loading || !this.valid()) return;
    
    this.loading = true;
    const btn = this.shadowRoot.getElementById('g');
    btn.disabled = true;
    this.status('⏳ Generating...');
    
    // Auto-increment seed
    this.seed = (this.seed + 1) % 1e9;
    this.shadowRoot.getElementById('s').value = this.seed;
    LS.setItem(KEYS.S, this.seed);
    
    const prompt = this.shadowRoot.getElementById('p').value.trim();
    const url = `${IMG_API}/${encodeURIComponent(prompt)}?model=${this.model}&width=${this.w}&height=${this.h}&seed=${this.seed}&nologo=true&private=true&noStore=true`;
    
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
      this.status('✓ Done', 'success');
    } catch (e) {
      console.error('Generation failed:', e);
      this.status(`✗ ${e.message.split('\n')[0]}`, 'error');
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
  color: #333;
  overflow: hidden;
  font-size: 14px;
}
#ct {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 4px;
  gap: 4px;
}
#p {
  width: 100%;
  height: 12vh;
  min-height: 60px;
  padding: 6px;
  border: 1px solid #ccc;
  border-radius: 4px;
  resize: vertical;
  font: inherit;
  box-sizing: border-box;
}
.cs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px 0;
  align-items: center;
  background: #f8f9fa;
  border-radius: 4px;
}
#g {
  background: #007bff;
  color: #fff;
  border: 0;
  border-radius: 4px;
  padding: 6px 12px;
  font-weight: 600;
  min-width: 70px;
}
#g:disabled {
  background: #aaa;
  cursor: wait;
}
.cg {
  display: flex;
  align-items: center;
  gap: 2px;
}
.cg label {
  font-size: 12px;
  color: #555;
  white-space: nowrap;
}
.cg input,
.cg select {
  padding: 3px 6px;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 13px;
  height: 28px;
  width: 70px;
}
#settingsBtn {
  background: #6c757d;
  color: #fff;
  border: 0;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 14px;
  min-width: 28px;
}
.s {
  padding: 4px 6px;
  border-radius: 3px;
  font-size: 13px;
  min-height: 20px;
  text-align: center;
  opacity: 0.95;
}
.s.success { background: #d4edda; color: #155724; }
.s.error { background: #f8d7da; color: #721c24; }
.s.load { background: #d1ecf1; color: #0c5460; }
#i {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #f8f9fa;
  border: 1px solid #eee;
  border-radius: 4px;
}
#settingsModal {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.7);
  z-index: 1000;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
}
#settingsContent {
  background: #fff;
  border-radius: 8px;
  width: 90%;
  max-width: 320px;
  overflow: hidden;
}
#settingsHeader {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f8f9fa;
}
#closeSettings {
  background: #dc3545;
  color: #fff;
  border: 0;
  border-radius: 3px;
  padding: 4px 8px;
  font-size: 14px;
}
#settingsGroup {
  padding: 12px;
}
.setting-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
}
.setting-row label {
  font-size: 13px;
  font-weight: 500;
  min-width: 80px;
  color: #333;
}
.setting-row input {
  flex: 1;
  padding: 6px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 13px;
}
#saveSettingsBtn {
  width: 100%;
  background: #28a745;
  color: #fff;
  border: 0;
  border-radius: 0;
  padding: 10px;
  font-weight: 600;
}
@media (max-width: 480px) {
  .cs { flex-direction: row; flex-wrap: wrap; }
  .cg { flex-direction: column; align-items: flex-start; gap: 0; }
  .cg label { margin-bottom: 2px; }
  #p { height: 10vh; }
  .setting-row { flex-direction: column; align-items: flex-start; }
  .setting-row label { margin-bottom: 4px; }
  .cg input { width: 60px; font-size: 12px; padding: 2px 4px; }
}
</style>
<div id="ct">
  <textarea id="p" placeholder="Describe image...">a cat</textarea>
  <div class="cs">
    <button id="g">✨ Go</button>
    <div class="cg"><label>W</label><input id="w" type="number"></div>
    <div class="cg"><label>H</label><input id="h" type="number"></div>
    <div class="cg"><label>Seed</label><input id="s" type="number" min="0" max="1000000000"></div>
    <div class="cg"><label>M</label><select id="m"></select></div>
    <button id="settingsBtn">⚙️</button>
  </div>
  <div id="st" class="s" onclick="this.textContent=''"></div>
  <div style="flex-grow:1;min-height:150px;border:1px solid #eee;border-radius:4px;overflow:hidden">
    <img id="i" alt="Result">
  </div>
  
  <div id="settingsModal">
    <div id="settingsContent">
      <div id="settingsHeader">
        <strong style="font-size:16px">Settings</strong>
        <button id="closeSettings">✕</button>
      </div>
      <div id="settingsGroup">
        <div class="setting-row">
          <label>API Key:</label>
          <input type="password" id="apiKeyInput" placeholder="Pollinations API key">
        </div>
        <div class="setting-row">
          <label>Default Width:</label>
          <input type="number" id="defaultWidth" placeholder="320">
        </div>
        <div class="setting-row">
          <label>Default Height:</label>
          <input type="number" id="defaultHeight" placeholder="480">
        </div>
        <div style="font-size:11px;color:#666;margin-top:8px">
          Get API key: <a href="https://pollinations.ai" target="_blank" style="color:#007bff;text-decoration:underline">pollinations.ai</a>
        </div>
      </div>
      <button id="saveSettingsBtn">💾 Save All Settings</button>
    </div>
  </div>
</div>`;
  }
}

customElements.define('image-generator', ImageGenerator);