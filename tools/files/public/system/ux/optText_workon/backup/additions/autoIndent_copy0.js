// ./system/ux/additions/autoIndent.js
import { additionManager } from '../optTextAdditions.js';

console.log("✅ autoIndent.js module loaded");

additionManager.register({
	id: 'autoIndent',
	name: 'Auto Indent',
	isAutoInit: true,
	init: (api, container, dataManager) => {
		console.log("✅ autoIndent init() executed!");
		
		const hiddenInput = container.querySelector('.opt-text-hidden-input');
		let isHandlingEnter = false; // 🔒 Synchronous lock to prevent double firing on

		// 2. ✅ HANDLE 'keydown' EVENT (Auto-indent logic)
		const handleKeyDown = (e) => {
			// Match Enter (covers iOS/Android/Safari quirks), ignoring Ctrl/Meta
			if ((e.key === 'Enter' || e.keyCode === 13) && !e.ctrlKey && !e.metaKey) {
				
				// 🔒 If we are already processing an Enter, BLOCK duplicate events immediately
				if (isHandlingEnter) {
					e.preventDefault();
					e.stopPropagation();
					return;
				}

				isHandlingEnter = true;
				e.preventDefault();
				e.stopPropagation();

				// Immediately clear hidden input to squash any buffered input events
				if (hiddenInput) hiddenInput.value = '';

				// ⏱️ Defer by 16ms (1 frame). Gives iOS/mobile time to flush the '{' input event
				setTimeout(() => {
					try {
						const cursorPos = api.editor.getCursor();
						const lines = api.editor.getLines();

						const lineIdx = cursorPos.line;
						const col = cursorPos.col;
						const currentLine = lines[lineIdx] || '';

						const before = currentLine.slice(0, col);
						const after = currentLine.slice(col);

						// Calculate indent
						const leadingTabs = (before.match(/^\t+/) || [''])[0].length;
						const openBrackets = (before.match(/[{[(]/g) || []).length;
						const closeBrackets = (before.match(/[}\])]/g) || []).length;
						let indentLevel = leadingTabs + (openBrackets - closeBrackets);

						// Guarantee indent after opening brackets
						if (before.trim().endsWith('{') || before.trim().endsWith('[') || before.trim().endsWith('(')) {
							indentLevel = Math.max(indentLevel, leadingTabs + 1);
						}

						// Smart dedent if closing bracket is ahead
						if (/^\s*[}\])]/.test(after)) {
							indentLevel = Math.max(0, indentLevel - 1);
						}

						const newIndent = '\t'.repeat(Math.max(0, indentLevel));
						console.log(`[AutoIndent] Line: "${currentLine}" | Before: "${before}" | Indent Level: ${indentLevel}`);

						// Apply exactly ONE newline with proper indent
						api.editor.augmentLines((currentLines) => {
							const newLines = [...currentLines];
							newLines[lineIdx] = before;
							newLines.splice(lineIdx + 1, 0, newIndent + after);
							return newLines;
						});

						// Move cursor to start of new indent
						api.editor.setCursor(lineIdx + 1, newIndent.length);

					} catch (err) {
						console.error("[AutoIndent] Error during auto-indent:", err);
					} finally {
						// 🔓 Release lock so the next physical Enter press can be processed
						isHandlingEnter = false;
					}
				}, 16);
			}
		};

		// Capture phase ensures we run BEFORE optText.js sees the event
		container.addEventListener('keydown', handleKeyDown, true);
		console.log("✅ autoIndent keydown and input listeners attached (capture phase)");

		// Cleanup
		return () => {
			container.removeEventListener('keydown', handleKeyDown, true);
			console.log("✅ autoIndent listeners cleaned up");
 a		};
	}
});