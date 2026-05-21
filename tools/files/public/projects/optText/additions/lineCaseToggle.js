// ./system/ux/additions/lineCaseToggle.js
import { additionManager } from '../optTextAdditions.js';

additionManager.register({
  id: 'case-toggle',
  name: 'Case Toggle',
  dropdownItem: { label: '🔠 Case Toggle', icon: '' },
  
  toolUI: (api) => `
    <button class="opt-text-toolbar-btn" id="btn-upper" title="UPPERCASE" style="font-weight:bold;font-size:12px;">ABC</button>
    <button class="opt-text-toolbar-btn" id="btn-lower" title="lowercase" style="font-weight:bold;font-size:12px;">abc</button>
    <button class="opt-text-toolbar-btn" id="btn-title" title="Title Case" style="font-weight:bold;font-size:12px;">Aa</button>
    <input type="text" id="case-status" placeholder="Status..." style="font-size:12px;padding:2px 6px;border-radius:4px;border:1px solid #ddd;width:100px;margin-left:auto;" readonly>
  `,

  init: (api, container, dataManager) => {
    const status = container.querySelector('#case-status');
    
    const applyCase = (mode) => {
      const original = api.editor.augmentLines((lines) => {
        return lines.map(l => {
          switch(mode) {
            case 'upper': return l.toUpperCase();
            case 'lower': return l.toLowerCase();
            case 'title': return l.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.substr(1).toLowerCase());
            default: return l;
          }
        });
      });
      status.value = `✅ Applied to ${original?.length || 0} lines`;
      api.ui.toast(`Lines converted to ${mode}`);
    };

    container.querySelector('#btn-upper')?.addEventListener('click', () => applyCase('upper'));
    container.querySelector('#btn-lower')?.addEventListener('click', () => applyCase('lower'));
    container.querySelector('#btn-title')?.addEventListener('click', () => applyCase('title'));
  },

  cleanup: () => {}
});