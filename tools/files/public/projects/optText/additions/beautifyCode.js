import { additionManager } from '../optTextAdditions.js';

// ✅ Module-scope variable for cleanup safety
let _hasRun = false;

additionManager.register({
    id: 'code-beautifier',
    dropdownItem: { label: 'Beautify Code', icon: '✨' },
    
    // ✅ REQUIRED: toolUI returns minimal HTML
    toolUI: (api) => `<span id="beautify-status" style="font-size:11px;color:var(--ot-text-muted,#666);">Beautifying...</span>`,
    
    // ✅ REQUIRED: init runs when tool panel opens
    init: (api, container, dataManager) => {
        if (_hasRun) return;
        _hasRun = true;
        
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
                
                // Preserve empty lines
                if (trimmed === '') {
                    beautified.push('');
                    continue;
                }
                
                let scanStart = 0;
                
                // De-indent if line starts with closing bracket (outside strings/comments)
                if (!inString && !inMultiComment && /^[})\]]/.test(trimmed)) {
                    indentLevel = Math.max(0, indentLevel - 1);
                    scanStart = 1;
                }
                
                // Inside multi-comment: preserve original formatting
                if (inMultiComment) {
                    beautified.push(rawLine);
                } else {
                    // ✅ USE REAL TAB CHARACTER (\t) - NOT SPACES
                    beautified.push('\t'.repeat(indentLevel) + trimmed);
                }
                
                // Parse line to update indent level for NEXT line
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
                        } else if (c === '/' && next === '/') {
                            break;
                        } else if (c === '/' && next === '*') {
                            inMultiComment = true;
                            i++;
                        } else if (c === '{' || c === '[' || c === '(') {
                            indentLevel++;
                        } else if (c === '}' || c === ']' || c === ')') {
                            indentLevel = Math.max(0, indentLevel - 1);
                        }
                    }
                }
                indentLevel = Math.max(0, indentLevel);
            }
            
            // ✅ Apply via official API (auto-pushes to undo/redo history)
            api.editor.setLines(beautified, 'beautify');
            api.editor.setCursor(cursor.line, cursor.col);
            api.editor.scrollToCursor();
            api.ui.toast('Code beautified ✨');
            
        } catch (err) {
            console.error('Beautify error:', err);
            api.ui.toast('Beautify failed ❌');
        }
        
        // ✅ Auto-close tool panel after execution
        setTimeout(() => {
            api.ui.exit();
            _hasRun = false;
        }, 50);
    },
    
    // ✅ Safe cleanup
    cleanup: () => {
        _hasRun = false;
    }
});