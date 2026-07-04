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
            if (trimmed === '') { 
                beautified.push(''); 
                continue; 
            }
            
            let scanStart = 0;
            if (!inString && !inMultiComment && /^[})\]]/.test(trimmed)) {
                indentLevel = Math.max(0, indentLevel - 1);
                scanStart = 1;
            }
            
            if (inMultiComment) {
                beautified.push(rawLine);
            } else {
                beautified.push('\t'.repeat(indentLevel) + trimmed);
            }
            
            for (let i = scanStart; i < trimmed.length; i++) {
                const c = trimmed[i];
                const next = trimmed[i + 1];
                
                if (inString) {
                    if (c === stringChar && (i === 0 || trimmed[i - 1] !== '\\')) {
                        inString = false;
                    }
                } else if (inMultiComment) {
                    if (c === '*' && next === '/') { 
                        inMultiComment = false; 
                        i++; 
                    }
                } else {
                    if (c === "'" || c === '"' || c === '`') { 
                        inString = true; 
                        stringChar = c; 
                    }
                    else if (c === '/' && next === '/') { 
                        break; 
                    }
                    else if (c === '/' && next === '*') { 
                        inMultiComment = true; 
                        i++; 
                    }
                    else if (c === '{' || c === '[' || c === '(') { 
                        indentLevel++; 
                    }
                    else if (c === '}' || c === ']' || c === ')') { 
                        indentLevel = Math.max(0, indentLevel - 1); 
                    }
                }
            }
            indentLevel = Math.max(0, indentLevel);
        }
        
        api.editor.setLines(beautified, 'beautify');
        api.editor.setCursor(cursor.line, cursor.col);
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