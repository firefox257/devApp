// ./system/ux/optText/additions/selectBracketDropdown.js
import { additionManager } from '../optTextAdditions.js';
import { selectBracketContent } from './selectBracketCore.js';

additionManager.register({
    id: 'selectBracket',
    dropdownItem: { 
        label: 'Select Bracket Content', 
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>' 
    },
    stateConfig: {
        disabled: { attribute: 'selectbracket-disabled', property: 'selectBracketDropdownDisabled' },
        hidden: { attribute: 'selectbracket-hidden', property: 'selectBracketDropdownHidden' }
    },
    toolUI: (api) => `<span id="select-bracket-status" style="font-size:11px;color:var(--ot-text-muted,#666);">Selecting...</span>`,
    action: (api, container, dataManager) => {
        selectBracketContent(api);
        // Exit the dropdown/activation state immediately after running
        setTimeout(() => {
            api.ui.exit();
        }, 50);
    }
});