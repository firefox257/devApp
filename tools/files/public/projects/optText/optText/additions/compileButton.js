// ./system/ux/optText/additions/compileButton.js
import { additionManager } from '../optTextAdditions.js';
additionManager.register({
	id: 'compile',
	isStaticToolbarButton: true,
	attribute: 'oncompile',
	property: 'onCompile',
	stateConfig: {
		disabled: { attribute: 'compile-disabled', property: 'compileDisabled' },
		hidden: { attribute: 'compile-hidden', property: 'compileHidden' }
	},
	toolbarButton: {
		icon: '⚙️',
		label: 'Compile',
		action: (api, container) => {
			if (!container) return;
			if (container.compileDisabled) return;
			
			const callback = container.onCompile;
			if (typeof callback === 'function') {
				callback(container);
			}
		}
	}
});