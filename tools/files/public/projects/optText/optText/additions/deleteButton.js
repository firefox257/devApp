// ./system/ux/optText/additions/deleteButton.js
import { additionManager } from '../optTextAdditions.js';
additionManager.register({
	id: 'delete',
	isStaticToolbarButton: true,
	attribute: 'ondelete',
	property: 'onDelete',
	stateConfig: {
		disabled: { attribute: 'delete-disabled', property: 'deleteDisabled' },
		hidden: { attribute: 'delete-hidden', property: 'deleteHidden' }
	},
	toolbarButton: {
		icon: '🗑️',
		label: 'Delete',
		action: (api, container) => {
			if (!container) return;
			if (container.deleteDisabled) return;
			
			const callback = container.onDelete;
			if (typeof callback === 'function') {
				callback(container);
			}
		}
	}
});