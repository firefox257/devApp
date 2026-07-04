// ./system/ux/optTextAdditionsRegistry.js
import { additionManager } from './optTextAdditions.js';

// === ADDITION MANIFEST ===
// Import each addition file below. They auto-register on load.
import './additions/searchTool.js';
import './additions/beautifyCode.js';
import './additions/saveButton.js';
import './additions/selectBracket.js';
import './additions/pagesManager.js';
import './additions/autoIndent.js';


export { additionManager };