// ./system/ux/optText/additions/selectBracketButton.js
import { additionManager } from '../optTextAdditions.js';
import { selectBracketContent } from './selectBracketCore.js';

additionManager.register({
    id: 'selectBracket',
    isStaticToolbarButton: true,
    stateConfig: {
        disabled: { attribute: 'selectbracket-disabled', property: 'selectBracketButtonDisabled' },
        hidden: { attribute: 'selectbracket-hidden', property: 'selectBracketButtonHidden' }
    },
    toolbarButton: {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
        label: 'Select Bracket Content',
        action: (api, container) => {
            if (container.selectBracketButtonDisabled) return;
            selectBracketContent(api);
        }
    }
});