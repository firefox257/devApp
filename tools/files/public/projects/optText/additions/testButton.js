// ./system/ux/additions/testButton.js
import { additionManager } from '../optTextAdditions.js';

additionManager.register({
  id: 'test-button',
  init: () => {}, // Required stub for validation
  isStaticToolbarButton: true,
  toolbarButton: {
    label: 'Test Action',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M12 16h.01"/></svg>`,
    action: (api) => {
      const timestamp = new Date().toLocaleTimeString();
      const message = `--- Test Addition [${timestamp}] ---`;
      
      // ✅ augmentLines handles the snapshot, pushes to undo stack, and triggers re-render
      api.editor.augmentLines(lines => {
        return [message, ...lines];
      });
      
      api.ui.toast('Prepended timestamp message! 🧪');
      console.log('Full API:', api);
    }
  }
});