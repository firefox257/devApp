// ./system/ux/additions/autoIndent.js
import { additionManager } from '../optTextAdditions.js';

// Module-scoped variables to ensure clean removal during cleanup
let _container = null;
let _handleKeyDown = null;

additionManager.register({
	id: 'autoIndent',
	name: 'Auto Indent',
	
	// ✅ Universal auto-init will run this automatically because `init` exists
	
	init: (api, container, dataManager) => {
		_container = container;
		const hiddenInput = container.querySelector('.opt-text-hidden-input');
		let isHandlingEnter = false;

		_handleKeyDown = (e) => {
			if ((e.key === 'Enter' || e.keyCode === 13) && !e.ctrlKey && !e.metaKey) {
				if (isHandlingEnter) {
					e.preventDefault();
					e.stopPropagation();
					return;
				}

				isHandlingEnter = true;
				e.preventDefault();
				e.stopPropagation();

				if (hiddenInput) hiddenInput.value = '';

				setTimeout(() => {
					try {
						const cursorPos = api.editor.getCursor();
						const lines = api.editor.getLines();
						const lineIdx = cursorPos.line;
						const col = cursorPos.col;
						const currentLine = lines[lineIdx] || '';

						const before = currentLine.slice(0, col);
						const after = currentLine.slice(col);

						const leadingTabs = (before.match(/^\t+/) || [''])[0].length;
						const openBrackets = (before.match(/[{[(]/g) || []).length;
						const closeBrackets = (before.match(/[}\])]/g) || []).length;
						let indentLevel = leadingTabs + (openBrackets - closeBrackets);

						if (before.trim().endsWith('{') || before.trim().endsWith('[') || before.trim().endsWith('(')) {
							indentLevel = Math.max(indentLevel, leadingTabs + 1);
						}

						if (/^\s*[}\])]/.test(after)) {
							indentLevel = Math.max(0, indentLevel - 1);
						}

						const newIndent = '\t'.repeat(Math.max(0, indentLevel));

						api.editor.augmentLines((currentLines) => {
							const newLines = [...currentLines];
							newLines[lineIdx] = before;
							newLines.splice(lineIdx + 1, 0, newIndent + after);
							return newLines;
						});

						api.editor.setCursor(lineIdx + 1, newIndent.length);
					} catch (err) {
						console.error("[AutoIndent] Error during auto-indent: ", err);
					} finally {
						isHandlingEnter = false;
					}
				}, 16);
			}
		};

		container.addEventListener('keydown', _handleKeyDown, true);
	},

	cleanup: () => {
		if (_container && _handleKeyDown) {
			_container.removeEventListener('keydown', _handleKeyDown, true);
			_container = null;
			_handleKeyDown = null;
		}
	}
});