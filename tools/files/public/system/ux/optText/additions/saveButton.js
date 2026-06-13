// ./system/ux/optText/additions/saveButton.js
import { additionManager } from '../optTextAdditions.js';

additionManager.register({
	id: 'save',
	isStaticToolbarButton: true,
	attribute: 'onsave',
	property: 'onSave',
	
	// ✅ State management configuration for HTML attributes and JS properties
	stateConfig: {
		disabled: { attribute: 'save-disabled', property: 'saveDisabled' },
		hidden: { attribute: 'save-hidden', property: 'saveHidden' }
	},

	toolbarButton: {
		icon: '💾',
		label: 'Save',
		action: (api, container) => {
			if (!container) return;
			// The native 'disabled' attribute already prevents the browser 
			// from firing the click event, making this a safe fallback.
			if (container.saveButtonDisabled) return;
			
			const callback = container.onSave;
			if (typeof callback === 'function') {
				callback(container);
			}
		}
	}
	// ✅ No `init` function needed! State management is handled universally.
});