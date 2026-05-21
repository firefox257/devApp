// ./system/ux/additions/testButtonWithMenu.js
import { additionManager } from '../optTextAdditions.js';

additionManager.register({
  id: 'test-button-menu',
  isStaticToolbarButton: true, // Tells manager to inject a toolbar button
  toolbarButton: {
    label: 'Test Menu',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`
  },
  // ✅ Define the UI that appears in the toolbar when active
  toolUI: (api) => `
    <div style="display:flex;align-items:center;gap:6px;">
      <button class="opt-text-toolbar-btn" data-action="test-append" title="Append Timestamp">⬇️</button>
      <button class="opt-text-toolbar-btn" data-action="test-prepend" title="Prepend Timestamp">⬆️</button>
      <button class="opt-text-toolbar-btn" data-action="test-clear" title="Clear All">🗑️</button>
      <span style="font-size:11px;color:#666;margin-left:6px;">Test Tool</span>
    </div>
  `,
  // ✅ Bind click events to buttons inside the tool UI
  init: (api, container, dataManager) => {
    const toolEl = container.querySelector('#opt-addition-active-tool');
    if (!toolEl) return;

    toolEl.querySelector('[data-action="test-append"]')?.addEventListener('click', () => {
      api.editor.augmentLines(lines => [...lines, `--- Added at ${new Date().toLocaleTimeString()} ---`]);
      api.ui.toast('Appended timestamp!');
    });

    toolEl.querySelector('[data-action="test-prepend"]')?.addEventListener('click', () => {
      api.editor.augmentLines(lines => [`--- Prepend at ${new Date().toLocaleTimeString()} ---`, ...lines]);
      api.ui.toast('Prepended timestamp!');
    });

    toolEl.querySelector('[data-action="test-clear"]')?.addEventListener('click', async () => {
      const res = await api.ui.modal.show({
        title: 'Clear All Lines?',
        message: 'This action cannot be undone without pressing Ctrl+Z.',
        confirmText: 'Clear'
      });
      if (res.action === 'confirm') {
        api.editor.setLines([''], 'test-menu-clear');
        api.ui.toast('Document cleared!');
      }
    });
  },
  cleanup: () => {}
});