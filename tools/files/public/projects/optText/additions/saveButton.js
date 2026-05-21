import { additionManager } from '../optTextAdditions.js';

// Module-scope reference to capture the container during initialization
let editorInstance = null;

additionManager.register({
		id: 'save-button',
		isStaticToolbarButton: true,
		toolbarButton: {
			icon: '💾',
			label: 'Save',
			// Triggered when the button is clicked
			action: () => {
				alert("here1");
				if (!editorInstance) return;

				const callback = editorInstance.onSave;
				if (typeof callback === 'function') {
					// Calls the host-defined function and passes the optText container
					//callback(editorInstance);
				
				}
			}
		},
		init: (api, container) => {
			// Capture reference for the toolbar button to use later
			editorInstance = container;
		}
	});