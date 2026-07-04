// ./system/ux/optText/additions/runDropdown.js
import { additionManager } from '../optTextAdditions.js';
additionManager.register({
	id: 'run',
	attribute: 'onrun',
	property: 'onRun',
	stateConfig: {
		disabled: { attribute: 'run-disabled', property: 'runDisabled' },
		hidden: { attribute: 'run-hidden', property: 'runHidden' }
	},
	dropdownItem: {
		label: 'Run',
		icon: '▶️'
	},
	action: (api, container, dataManager) => {
		if (!container) return;
		
		if (container.runDisabled) {
			api.ui.toast('Run is currently disabled');
			return;
		}

		const callback = container.onRun;
		if (typeof callback === 'function') {
			callback(container);
		} else {
			api.ui.toast('No onRun handler defined');
		}
	}
});