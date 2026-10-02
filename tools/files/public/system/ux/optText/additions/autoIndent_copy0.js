import { additionManager } from '../optTextAdditions.js';

additionManager.register({
	id: 'autoIndent',
	name: 'Auto Indent',
	description: 'Automatically indents new lines and aligns with programming brackets.',
	
	hooks: {
		beforeInsert: (payload) => {
			// Only intercept newline insertions for this specific feature
			if (payload.key !== 'Enter' && payload.defaultText !== '\n') {
				return payload; 
			}

			const { line, col, lines } = payload;
			const currentLine = lines[line] || '';
			
			// 1. Get the text before the cursor to determine current indentation
			const textBeforeCursor = currentLine.slice(0, col);
			const indentMatch = textBeforeCursor.match(/^(\s*)/);
			let baseIndent = indentMatch ? indentMatch[1] : '';
			
			// 2. Check if the text before the cursor ends with an opening bracket
			const trimmedBeforeCursor = textBeforeCursor.trim();
			const lastChar = trimmedBeforeCursor.slice(-1);
			const isOpenBracket = ['{', '[', '('].includes(lastChar);
			
			// 3. Check if there is a closing bracket immediately after the cursor
			// (e.g., user pressed Enter between { and })
			const textAfterCursor = currentLine.slice(col);
			const trimmedAfterCursor = textAfterCursor.trimStart();
			const nextChar = trimmedAfterCursor.charAt(0);
			const isNextCloseBracket = ['}', ']', ')'].includes(nextChar);

			let newIndent = baseIndent;
			if (isOpenBracket) {
				newIndent += '\t'; // Add an extra tab for the new block
				
				// Optional: If there's a closing bracket right after, we might want to 
				// insert a newline, the new indent, AND another newline with base indent 
				// to sandwich the cursor. For now, standard single-line indent is applied.
			}

			// 4. Return the custom text to insert and prevent the default '\n' behavior
			return {
				text: '\n' + newIndent,
				prevented: true
			};
		}
	}
});