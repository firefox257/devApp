// ./system/ux/optText/additions/deleteDropdown.js
import { additionManager } from '../optTextAdditions.js';
additionManager.register({
	id: 'delete',
	attribute: 'ondelete',
	property: 'onDelete',
	stateConfig: {
		disabled: { attribute: 'delete-disabled', property: 'deleteDisabled' },
		hidden: { attribute: 'delete-hidden', property: 'deleteHidden' }
	},
	dropdownItem: {
		label: 'Delete',
		icon: '🗑️'
	},
	action: (api, container, dataManager) => {
		if (!container) return;
		
		if (container.deleteDisabled) {
			api.ui.toast('Delete is currently disabled');
			return;
		}

		const callback = container.onDelete;
		if (typeof callback === 'function') {
			callback(container);
		} else {
			api.ui.toast('No onDelete handler defined');
		}
	}
});