// ./system/ux/additions/saveButton.js
import { additionManager } from '../optTextAdditions.js';

additionManager.register({
	id: 'saveButton',
	isStaticToolbarButton: true,
	isAutoInit: true,
	attribute: 'onsave',
	property: 'onSave',
	
	// ✅ State management configuration for HTML attributes and JS properties
	stateConfig: {
		disabled: { attribute: 'savebutton-disabled', property: 'saveButtonDisabled' },
		hidden: { attribute: 'savebutton-hidden', property: 'saveButtonHidden' }
	},

	toolbarButton: {
		icon: '💾',
		label: 'Save',
		action: (api, container) => {
			if (!container) return;
			// Note: The native 'disabled' attribute already prevents the browser 
			// from firing the click event, making this a safe fallback.
			if (container.saveButtonDisabled) return;
			
			const callback = container.onSave;
			if (typeof callback === 'function') {
				callback(container);
		 }
		}
	},

	init: (api, container) => {
		const btn = container.querySelector(`[data-addition-id="saveButton"]`);
		if (!btn) return;

		const updateState = () => {
			// ✅ UNIVERSAL DISABLED STATE:
			// Just toggle the native attribute. The CSS in optTextUI.js handles 
			// the visual "grayout" (opacity) and click prevention for ALL content types.
			btn.disabled = container.saveButtonDisabled;
			
			if (container.saveButtonDisabled) {
				btn.setAttribute('aria-disabled', 'true');
			} else {
				btn.removeAttribute('aria-disabled');
			}
			
			// ✅ Handle hidden state cleanly
			// Setting to '' removes the inline style, letting default CSS (display: flex) take over
			btn.style.display = container.saveButtonHidden ? 'none' : '';
		};

		// Define reactive properties on the container instance
		Object.defineProperty(container, 'saveButtonDisabled', {
			get() { return this._saveButtonDisabled === true; },
			set(val) {
				this._saveButtonDisabled = Boolean(val);
				updateState();
			},
			configurable: true
		});

		Object.defineProperty(container, 'saveButtonHidden', {
			get() { return this._saveButtonHidden === true; },
			set(val) {
				this._saveButtonHidden = Boolean(val);
				updateState();
			},
			configurable: true
		});

		// Initial state evaluation (reads the _ prefixed values set by optText.js)
		updateState();
	}
});