// ./system/ux/optText/additions/compileDropdown.js
import { additionManager } from '../optTextAdditions.js';
additionManager.register({
	id: 'compile',
	attribute: 'oncompile',
	property: 'onCompile',
	stateConfig: {
		disabled: { attribute: 'compile-disabled', property: 'compileDisabled' },
		hidden: { attribute: 'compile-hidden', property: 'compileHidden' }
	},
	dropdownItem: {
		label: 'Compile',
		icon: '⚙️'
	},
	action: (api, container, dataManager) => {
		if (!container) return;
		
		if (container.compileDisabled) {
			api.ui.toast('Compile is currently disabled');
			return;
		}

		const callback = container.onCompile;
		if (typeof callback === 'function') {
			callback(container);
		} else {
			api.ui.toast('No onCompile handler defined');
		}
	}
});