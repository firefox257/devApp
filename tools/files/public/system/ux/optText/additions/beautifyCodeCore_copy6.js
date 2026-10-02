// ./system/ux/optText/additions/beautifyCodeCore.js
let _isRunning = false;

export function beautifyCode(api) {
    if (_isRunning) return;
    _isRunning = true;

    try {
        const lines = api.editor.getLines();
        const cursor = api.editor.getCursor();
        
        let indentLevel = 0;
        const beautified = [];
        let inString = false;
        let stringChar = '';
        let inMultiComment = false;
        
        for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            
            // Preserve completely empty lines
            if (trimmed === '') { 
                beautified.push(''); 
                continue; 
            }
            
            // 1. Determine the indentation level for the *current* line
            let currentLineIndent = indentLevel;
            if (!inString && !inMultiComment && /^[})\]]/.test(trimmed)) {
                currentLineIndent = Math.max(0, currentLineIndent - 1);
            }
            
            // 2. CORE FIX: If inside a string or multi-line comment, preserve the raw line EXACTLY as is.
            // No trimming, no added indentation.
            if (inString || inMultiComment) {
                beautified.push(rawLine);
            } else {
                beautified.push('\t'.repeat(currentLineIndent) + trimmed);
            }
            
            // 3. Scan the line to update state for *subsequent* lines
            for (let i = 0; i < trimmed.length; i++) {
                const c = trimmed[i];
                const next = trimmed[i + 1];
                
                if (inString) {
                    if (c === stringChar) {
                        // Robust escape check: count consecutive backslashes
                        let backslashCount = 0;
                        for (let j = i - 1; j >= 0 && trimmed[j] === '\\'; j--) {
                            backslashCount++;
                        }
                        // Even number of backslashes means the quote is NOT escaped
                        if (backslashCount % 2 === 0) {
                            inString = false;
                        }
                    }
                } else if (inMultiComment) {
                    if (c === '*' && next === '/') { 
                        inMultiComment = false; 
                        i++; // Skip the '/'
                    }
                } else {
                    if (c === "'" || c === '"' || c === '`') { 
                        inString = true; 
                        stringChar = c; 
                    }
                    else if (c === '/' && next === '/') { 
                        break; // Rest of the line is a single-line comment
                    }
                    else if (c === '/' && next === '*') { 
                        inMultiComment = true; 
                        i++; // Skip the '*'
                    }
                    else if (c === '{' || c === '[' || c === '(') { 
                        indentLevel++; 
                    }
                    else if (c === '}' || c === ']' || c === ')') { 
                        indentLevel = Math.max(0, indentLevel - 1); 
                    }
                }
            }
        }
        
        api.editor.setLines(beautified, 'beautify');
        
        // 4. Safely restore cursor position, clamped to new document bounds
        const maxLine = Math.max(0, beautified.length - 1);
        const safeLine = Math.min(cursor.line, maxLine);
        const maxCol = beautified[safeLine].length;
        const safeCol = Math.min(cursor.col, maxCol);
        
        api.editor.setCursor(safeLine, safeCol);
        api.editor.scrollToCursor();
        api.ui.toast('Code beautified ✨');
        
    } catch (err) {
        console.error('Beautify error:', err);
        api.ui.toast('Beautify failed ❌');
    } finally {
        setTimeout(() => {
            _isRunning = false;
        }, 50);
    }
}