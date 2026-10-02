// ./system/ux/optText/additions/insertTabDropdown.js
import { additionManager } from '../optTextAdditions.js';

additionManager.register({
	id: 'insertTab',
	attribute: 'oninserttab',
	property: 'onInsertTab',
	stateConfig: {
		disabled: { attribute: 'insert-tab-disabled', property: 'insertTabDisabled' },
		hidden: { attribute: 'insert-tab-hidden', property: 'insertTabHidden' }
	},
	dropdownItem: {
		label: 'Insert Tab',
		icon: '⇥'
	},
	action: (api, container, dataManager) => {
		if (!container) return;
		
		if (container.insertTabDisabled) {
			api.ui.toast('Insert Tab is currently disabled');
			return;
		}

		const callback = container.onInsertTab;
		if (typeof callback === 'function') {
			callback(container);
		} else {
			if (typeof container._insertTextAtCursor === 'function') {
				container._insertTextAtCursor('\t', true);
				container.focus();
				api.ui.toast('Tab inserted');
			}
		}
	}
});