// ./system/ux/optText/optTextAdditionsRegistry.js
import { additionManager } from './optTextAdditions.js';

// === ADDITION MANIFEST ===
// Import each addition file below. They auto-register on load.

// Core File Operations
//import './additions/openButton.js';
import './additions/openDropdown.js';
import './additions/saveButton.js';
//import './additions/saveDropdown.js';
//import './additions/closeButton.js';
import './additions/closeDropdown.js';

// Execution Operations
import './additions/runButton.js';
//import './additions/runDropdown.js';
import './additions/compileButton.js';
//import './additions/compileDropdown.js';

// Management Operations
//import './additions/deleteButton.js';
//import './additions/deleteDropdown.js';

// Search Tool Split
import './additions/searchToolButton.js';
//import './additions/searchToolDropdown.js';

// Beautify Code Split
import './additions/beautifyCodeButton.js';
//import './additions/beautifyCodeDropdown.js';

// Select Bracket Split
import './additions/selectBracketButton.js';
//import './additions/selectBracketDropdown.js';

// Pages Manager Split
//import './additions/pagesManagerButton.js';
import './additions/pagesManagerDropdown.js';
import './additions/autoIndent.js';

export { additionManager };