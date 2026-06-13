// ./system/ux/optText/additions/openDropdown.js
import { additionManager } from '../optTextAdditions.js';
additionManager.register({
	id: 'open',
	attribute: 'onopen',
	property: 'onOpen',
	stateConfig: {
		disabled: { attribute: 'open-disabled', property: 'openDisabled' },
		hidden: { attribute: 'open-hidden', property: 'openHidden' }
	},
	dropdownItem: {
		label: 'Open',
		icon: '📂'
	},
	action: (api, container, dataManager) => {
		if (!container) return;
		
		if (container.openDisabled) {
			api.ui.toast('Open is currently disabled');
			return;
		}

		const callback = container.onOpen;
		if (typeof callback === 'function') {
			callback(container);
		} else {
			api.ui.toast('No onOpen handler defined');
		}
	}
});