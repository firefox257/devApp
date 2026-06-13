// ./system/ux/optText/additions/closeButton.js
import { additionManager } from '../optTextAdditions.js';
additionManager.register({
	id: 'close',
	isStaticToolbarButton: true,
	attribute: 'onclose',
	property: 'onClose',
	stateConfig: {
		disabled: { attribute: 'close-disabled', property: 'closeDisabled' },
		hidden: { attribute: 'close-hidden', property: 'closeHidden' }
	},
	toolbarButton: {
		icon: '❌',
		label: 'Close',
		action: (api, container) => {
			if (!container) return;
			if (container.closeDisabled) return;
			
			const callback = container.onClose;
			if (typeof callback === 'function') {
				callback(container);
			}
		}
	}
});