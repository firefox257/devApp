// ./system/ux/optText/additions/beautifyCodeButton.js
import { additionManager } from '../optTextAdditions.js';
import { beautifyCode } from './beautifyCodeCore.js';

additionManager.register({
    id: 'beautifyCode',
    isStaticToolbarButton: true,
    stateConfig: {
        disabled: { attribute: 'beautifycode-disabled', property: 'beautifyCodeDisabled' },
        hidden: { attribute: 'beautifycode-hidden', property: 'beautifyCodeHidden' }
    },
    toolbarButton: {
        label: 'Beautify Code',
        icon: '✨',
        action: (api, container) => {
            beautifyCode(api);
        }
    }
});