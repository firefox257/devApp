// ./system/ux/optText/additions/searchToolDropdown.js
import { additionManager } from '../optTextAdditions.js';
import { toolUI, init, cleanup } from './searchToolCore.js';

additionManager.register({
    id: 'searchTool',
    dropdownItem: { 
        label: 'Search', 
        icon: '🔍' 
    },
    stateConfig: {
        disabled: { attribute: 'searchtool-disabled', property: 'searchToolDropdownDisabled' },
        hidden: { attribute: 'searchtool-hidden', property: 'searchToolDropdownHidden' }
    },
    toolUI,
    init,
    cleanup
});