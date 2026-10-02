// ./system/ux/optText/additions/autoIndent.js
import { additionManager } from '../optTextAdditions.js';

additionManager.register({
	id: 'autoIndent',
	name: 'Auto Indent',
	description: 'Automatically indents new lines and aligns with programming brackets and HTML tags.',
	
	hooks: {
		beforeInsert: (payload) => {
			// Only intercept newline insertions for this specific feature
			if (payload.key !== 'Enter' && payload.defaultText !== '\n') {
				return payload; 
			}

			const { line, col, lines } = payload;
			const currentLine = lines[line] || '';
			const textBeforeCursor = currentLine.slice(0, col);
			const textAfterCursor = currentLine.slice(col);
			
			// Heuristic to detect if we are in an HTML context
			const hasHTMLTag = /<[a-zA-Z0-9\-]+[^>]*>/.test(currentLine) || (line > 0 && /<[a-zA-Z0-9\-]+[^>]*>/.test(lines[line - 1]));
			const hasJSKeyword = /^\s*(const|let|var|function|class|import|export|if|for|while|return|console|\/\/)\b/.test(currentLine);
			const isHTML = hasHTMLTag && !hasJSKeyword;

			// Helper to get base indent
			const indentMatch = textBeforeCursor.match(/^(\s*)/);
			let baseIndent = indentMatch ? indentMatch[1] : '';
			
			// Check if the text before the cursor ends with an opening programming bracket
			const trimmedBeforeCursor = textBeforeCursor.trim();
			const lastChar = trimmedBeforeCursor.slice(-1);
			const isOpenBracket = ['{', '[', '('].includes(lastChar);

			// --- HTML SPECIFIC LOGIC ---
			if (isHTML) {
				// 1. Check if we are inside a <script> or <style> block
				let inScriptOrStyle = false;
				for (let i = line; i >= 0; i--) {
					const l = lines[i];
					if (/<\/script>/i.test(l) || /<\/style>/i.test(l)) {
						break; // Exited the block
					}
					if (/<script[^>]*>/i.test(l) || /<style[^>]*>/i.test(l)) {
						inScriptOrStyle = true;
						break; // Found the opening block tag
					}
				}

				// 2. Standard HTML tag logic (applies to opening tags, even script/style)
				const voidTags = new Set([
					'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 
					'link', 'meta', 'param', 'source', 'track', 'wbr'
				]);
				
				const tagMatch = trimmedBeforeCursor.match(/<([a-zA-Z0-9\-!]+)[^>]*>$/);
				const isOpeningTag = tagMatch && 
				                     !tagMatch[1].startsWith('!') && // ignore <!doctype>, <!--
				                     !tagMatch[1].startsWith('?') && // ignore <?php
				                     !voidTags.has(tagMatch[1].toLowerCase()) && 
				                     !trimmedBeforeCursor.endsWith('/>');
				
				const closeTagMatch = textAfterCursor.trimStart().match(/^<\/([a-zA-Z0-9\-]+)>/);
				const isNextClosingTag = closeTagMatch && tagMatch && closeTagMatch[1].toLowerCase() === tagMatch[1].toLowerCase();

				if (isOpeningTag && isNextClosingTag) {
					// e.g., <div>|</div>  -->  <div>\n\t|\n</div>
					return {
						text: '\n' + baseIndent + '\t' + '\n' + baseIndent,
						prevented: true
					};
				} else if (isOpeningTag) {
					// e.g., <div>|  -->  <div>\n\t|
					return {
						text: '\n' + baseIndent + '\t',
						prevented: true
					};
				} else if (textAfterCursor.trimStart().startsWith('</')) {
					// e.g., |</div>  -->  \n|</div> (maintain base indent before closing tag)
					return {
						text: '\n' + baseIndent,
						prevented: true
					};
				}

				// 3. If we are inside script/style but NOT on the opening tag line, use JS indent logic
				if (inScriptOrStyle) {
					if (isOpenBracket) {
						return {
							text: '\n' + baseIndent + '\t',
							prevented: true
						};
					}
					return {
						text: '\n' + baseIndent,
						prevented: true
					};
				}
			}

			// --- DEFAULT JS/C++ LOGIC ---
			if (isOpenBracket) {
				return {
					text: '\n' + baseIndent + '\t',
					prevented: true
				};
			}

			// Fallback: just insert newline with current base indentation
			return {
				text: '\n' + baseIndent,
				prevented: true
			};
		}
	}
});