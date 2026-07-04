// ./system/ux/optText/additions/closeDropdown.js
import { additionManager } from '../optTextAdditions.js';
additionManager.register({
	id: 'close',
	attribute: 'onclose',
	property: 'onClose',
	stateConfig: {
		disabled: { attribute: 'close-disabled', property: 'closeDisabled' },
		hidden: { attribute: 'close-hidden', property: 'closeHidden' }
	},
	dropdownItem: {
		label: 'Close',
		icon: '❌'
	},
	action: (api, container, dataManager) => {
		if (!container) return;
		
		if (container.closeDisabled) {
			api.ui.toast('Close is currently disabled');
			return;
		}

		const callback = container.onClose;
		if (typeof callback === 'function') {
			callback(container);
		} else {
			api.ui.toast('No onClose handler defined');
		}
	}
});