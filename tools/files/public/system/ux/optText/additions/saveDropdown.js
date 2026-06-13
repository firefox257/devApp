// ./system/ux/optText/additions/saveDropdown.js
import { additionManager } from '../optTextAdditions.js';

additionManager.register({
	id: 'save', // Note: If you also use saveButton.js, consider changing this to 'save-dropdown' to avoid registry ID conflicts
	
	// ✅ HTML Attribute & JS Property binding (e.g., <opttext onsave="myFunc">)
	attribute: 'onsave',
	property: 'onSave', // Using safeOnSave to avoid conflict if both button and dropdown are loaded
	
	// ✅ State management configuration
	stateConfig: {
		disabled: { attribute: 'save-disabled', property: 'saveDisabled' },
		hidden: { attribute: 'save-hidden', property: 'saveHidden' }
	},
	
	dropdownItem: {
		label: 'Save',
		icon: '💾'
	},
	
	// ✅ CLEAR ACTION: Simple, one-off execution. No `init` confusion.
	action: (api, container, dataManager) => {
		if (!container) return;
		
		// ✅ FIXED: Use the correct property name defined in stateConfig ('saveDisabled')
		if (container.saveDisabled) {
			api.ui.toast('Save is currently disabled');
			return;
		}

		const callback = container.onSave;
		if (typeof callback === 'function') {
			callback(container);
		} else {
			api.ui.toast('No onSave handler defined');
		}
	}
});