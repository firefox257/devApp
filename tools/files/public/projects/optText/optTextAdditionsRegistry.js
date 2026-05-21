// ./system/ux/optTextAdditionsRegistry.js
import { additionManager } from './optTextAdditions.js';

// === ADDITION MANIFEST ===
// Import each addition file below. They auto-register on load.
import './additions/searchTool.js';
import './additions/beautifyCode.js';
import './additions/saveButton.js';

//import './additions/lineCaseToggle.js';
//import './additions/testButton.js';
//import './additions/testDropdown.js';
//import './additions/testButtonWithMenu.js';
// import './additions/findReplace.js';
// import './additions/lineSort.js';

export { additionManager };