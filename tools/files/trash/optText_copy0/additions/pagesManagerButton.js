// ./system/ux/optText/additions/pagesManagerButton.js
import { additionManager } from '../optTextAdditions.js';
import { toolUI, init, cleanup } from './pagesManagerCore.js';

additionManager.register({
    id: 'pagesManager',
    isStaticToolbarButton: true,
    stateConfig: {
        disabled: { attribute: 'pagesmanager-disabled', property: 'pagesManagerButtonDisabled' },
        hidden: { attribute: 'pagesmanager-hidden', property: 'pagesManagerButtonHidden' }
    },
    toolbarButton: {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
        label: 'Pages Manager'
    },
    toolUI,
    init,
    cleanup
});