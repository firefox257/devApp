// ./system/ux/optText/additions/runButton.js
import { additionManager } from '../optTextAdditions.js';
additionManager.register({
	id: 'run',
	isStaticToolbarButton: true,
	attribute: 'onrun',
	property: 'onRun',
	stateConfig: {
		disabled: { attribute: 'run-disabled', property: 'runDisabled' },
		hidden: { attribute: 'run-hidden', property: 'runHidden' }
	},
	toolbarButton: {
		icon: '▶️',
		label: 'Run',
		action: (api, container) => {
			if (!container) return;
			if (container.runDisabled) return;
			
			const callback = container.onRun;
			if (typeof callback === 'function') {
				callback(container);
			}
		}
	}
});