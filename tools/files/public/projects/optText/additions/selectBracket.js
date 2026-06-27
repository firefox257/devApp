// ./system/ux/additions/selectBracket.js
import { additionManager } from '../optTextAdditions.js';

const BRACKET_PAIRS = {
	'{': '}',
	'[': ']',
	'(': ')',
	'<': '>',
	'}': '{',
	']': '[',
	')': '(',
	'>': '<'
};

const isBracket = (char) => !!BRACKET_PAIRS[char];

function selectBracketContent(api) {
	const cursor = api.editor.getCursor();
	const lines = api.editor.getLines();
	const lineText = lines[cursor.line] || '';
	let targetBracket = '';
	let startLine = cursor.line;
	let startCol = -1;

	if (cursor.col > 0 && isBracket(lineText[cursor.col - 1])) {
		targetBracket = lineText[cursor.col - 1];
		startCol = cursor.col - 1;
	} else if (cursor.col < lineText.length && isBracket(lineText[cursor.col])) {
		targetBracket = lineText[cursor.col];
		startCol = cursor.col;
	}

	if (!targetBracket) {
		api.ui.toast('Cursor is not near a bracket'); 
		return;
	}

	const matchingBracket = BRACKET_PAIRS[targetBracket];
	const isOpening = ['{', '[', '(', '<'].includes(targetBracket);
	const searchDirection = isOpening ? 1 : -1;

	let currentCount = 1;
	let currentLine = startLine;
	let currentCol = startCol + searchDirection;

	while (currentLine >= 0 && currentLine < lines.length) {
		const currentLineText = lines[currentLine] || '';
		
		while (currentCol >= 0 && currentCol < currentLineText.length) {
			const char = currentLineText[currentCol];
			if (char === targetBracket) {
				currentCount++;
			} else if (char === matchingBracket) {
				currentCount--;
			}
			
			if (currentCount === 0) {
				const pos1 = { line: startLine, col: startCol };
				const pos2 = { line: currentLine, col: currentCol + 1 };
				
				const isPos1First = (startLine < currentLine) || (startLine === currentLine && startCol < currentCol + 1);
				const anchor = isPos1First ? pos1 : pos2;
				const focus = isPos1First ? pos2 : pos1;

				api.editor.setSelection(anchor, focus);
				api.editor.scrollToFocus();
				api.ui.toast('Bracket content selected');
				return;
			}
			currentCol += searchDirection;
		}
		
		if (searchDirection === 1) {
			currentLine++;
			currentCol = 0;
		} else {
			currentLine--;
			currentCol = (lines[currentLine] || '').length;
		}
	}

	api.ui.toast('No matching bracket found');
}

additionManager.register({
	id: 'selectBracket',
	isStaticToolbarButton: true,
	
	// ✅ Universal state management configuration (cleaned up attribute/property names)
	stateConfig: {
		disabled: { attribute: 'selectbracket-disabled', property: 'selectBracketDisabled' },
		hidden: { attribute: 'selectbracket-hidden', property: 'selectBracketHidden' }
	},

	toolbarButton: {
		icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
		label: 'Select Bracket Content',
		action: (api, container) => {
			// ✅ Safe fallback check (native 'disabled' attribute already prevents clicks, but this is a good secondary guard)
			if (container.selectBracketDisabled) return;
			selectBracketContent(api);
		}
	}
	// ✅ No `init` or `cleanup` needed for this direct-action button
});