// ./system/ux/optText/additions/insertTabButton.js
import { additionManager } from '../optTextAdditions.js';

additionManager.register({
	id: 'insertTab',
	isStaticToolbarButton: true,
	attribute: 'oninserttab',
	property: 'onInsertTab',
	stateConfig: {
		disabled: { attribute: 'insert-tab-disabled', property: 'insertTabDisabled' },
		hidden: { attribute: 'insert-tab-hidden', property: 'insertTabHidden' }
	},
	toolbarButton: {
		icon: '⇥', // Rightwards Arrow To Bar (standard Tab symbol)
		label: 'Insert Tab',
		action: (api, container) => {
			if (!container) return;
			if (container.insertTabDisabled) return;
			
			const callback = container.onInsertTab;
			if (typeof callback === 'function') {
				// Allow custom override if defined on the container (e.g., inserting 2 spaces instead)
				callback(container);
			} else {
				// Default behavior: insert a tab character and record it in undo history
				if (typeof container._insertTextAtCursor === 'function') {
					container._insertTextAtCursor('\t', true);
					container.focus(); // Ensure editor stays focused for continued typing
				}
			}
		}
	}
});