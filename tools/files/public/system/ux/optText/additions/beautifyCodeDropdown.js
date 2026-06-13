// ./system/ux/optText/additions/beautifyCodeDropdown.js
import { additionManager } from '../optTextAdditions.js';
import { beautifyCode } from './beautifyCodeCore.js';

additionManager.register({
    id: 'beautifyCode',
    dropdownItem: { 
        label: 'Beautify Code', 
        icon: '✨' 
    },
    toolUI: (api) => `<span id="beautify-status" style="font-size:11px;color:var(--ot-text-muted,#666);">Beautifying...</span>`,
    stateConfig: {
        disabled: { attribute: 'beautifycode-disabled', property: 'beautifyCodeDisabled' },
        hidden: { attribute: 'beautifycode-hidden', property: 'beautifyCodeHidden' }
    },
    init: (api, container, dataManager) => {
        beautifyCode(api);
        // Exit the dropdown/activation state immediately after running
        setTimeout(() => {
            api.ui.exit();
        }, 50);
    },
    cleanup: () => {
        // Cleanup if necessary
    }
});