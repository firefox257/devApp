// ./system/ux/additions/testDropdown.js
import { additionManager } from '../optTextAdditions.js';

additionManager.register({
  id: 'test-dropdown',
  init: () => {}, // Required stub for validation
  // ✅ Flag to indicate this acts as a simple menu action
  isDropdownAction: true,
  dropdownItem: {
    label: 'Test Dropdown Action',
    icon: '📉', // Optional icon
    action: (api) => {
      // ✅ This runs immediately on click without opening a toolbar tool
      api.ui.toast('Dropdown action triggered! 📉');
      console.log('Dropdown API:', api);
      
      // Example: Reverse lines
      // api.editor.augmentLines(lines => [...lines].reverse());
    }
  }
});