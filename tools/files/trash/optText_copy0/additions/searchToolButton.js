// ./system/ux/optText/additions/searchToolButton.js
import { additionManager } from '../optTextAdditions.js';
import { toolUI, init, cleanup } from './searchToolCore.js';

additionManager.register({
    id: 'searchTool',
    isStaticToolbarButton: true,
    stateConfig: {
        disabled: { attribute: 'searchtool-disabled', property: 'searchToolButtonDisabled' },
        hidden: { attribute: 'searchtool-hidden', property: 'searchToolButtonHidden' }
    },
    toolbarButton: {
        label: 'Search',
        icon: '🔍'
    },
    toolUI,
    init,
    cleanup
});