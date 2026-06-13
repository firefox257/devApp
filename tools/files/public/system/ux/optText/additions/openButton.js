// ./system/ux/optText/additions/openButton.js
import { additionManager } from '../optTextAdditions.js';
additionManager.register({
	id: 'open',
	isStaticToolbarButton: true,
	attribute: 'onopen',
	property: 'onOpen',
	stateConfig: {
		disabled: { attribute: 'open-disabled', property: 'openDisabled' },
		hidden: { attribute: 'open-hidden', property: 'openHidden' }
	},
	toolbarButton: {
		icon: '📂',
		label: 'Open',
		action: (api, container) => {
			if (!container) return;
			if (container.openDisabled) return;
			
			const callback = container.onOpen;
			if (typeof callback === 'function') {
				callback(container);
			}
		}
	}
});