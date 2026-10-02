// ./system/ux/optText/additions/beautifyCodeCore.js
let _isRunning = false;

// --- 1. Detection: Is this HTML or JS/C++? ---
function isHTML(lines) {
    const text = lines.join('\n').slice(0, 2000);
    
    // FIX: If it clearly starts with C++ or JS code, it's NOT an HTML file
    if (/^\s*(#include|import|export|function|class|let|const|var|using\s+namespace|int\s+main|void\s+main)/im.test(text)) {
        return false;
    }

    if (/<!DOCTYPE\s+html/i.test(text)) return true;
    if (/<(html|body|head|template)[\s>]/i.test(text)) return true;
    
    const tagCount = (text.match(/<[a-zA-Z0-9\-]+/g) || []).length;
    const braceCount = (text.match(/[{}]/g) || []).length;
    
    return tagCount >= 3 && tagCount > braceCount * 2;
}

// --- 2. JS/CSS/C++ Beautifier ---
function beautifyJS(lines) {
    let indentLevel = 0;
    const beautified = [];
    let inString = false;
    let stringChar = '';
    let inMultiComment = false;
    
    // C++ Raw String Literal State
    let inCppRawString = false;
    let cppRawStringDelim = "";
    let cppRawStringLines = [];
    let cppRawStringBaseIndent = 0;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const rawLine = lines[lineIdx] ?? '';
        const trimmed = rawLine.trim();
        
        // 1. Handle C++ Raw String Continuation
        if (inCppRawString) {
            const escapedDelim = cppRawStringDelim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const closeRegex = new RegExp(`^\\)${escapedDelim}"`);
            
            if (closeRegex.test(trimmed)) {
                inCppRawString = false;
                
                // FIX: Beautify the collected raw string content, delegating to HTML if applicable
                let innerBeautified;
                if (isHTML(cppRawStringLines)) {
                    innerBeautified = beautifyHTML(cppRawStringLines);
                } else {
                    innerBeautified = cppRawStringLines; 
                }
                
                let innerIndentStr = '\t'.repeat(cppRawStringBaseIndent + 1);
                for (let innerLine of innerBeautified) {
                    if (innerLine.trim() === '') beautified.push('');
                    else beautified.push(innerIndentStr + innerLine);
                }
                
                // Push the closing line at the base indent
                beautified.push('\t'.repeat(cppRawStringBaseIndent) + trimmed);
                continue;
            } else {
                cppRawStringLines.push(trimmed);
                continue;
            }
        }
        
        if (trimmed === '') {
            beautified.push('');
            continue;
        }

        let leadingClose = 0;
        for (let i = 0; i < trimmed.length; i++) {
            const c = trimmed[i];
            if (c === '}' || c === ']' || c === ')') {
                leadingClose++;
            } else {
                break;
            }
        }

        let currentLineIndent = Math.max(0, indentLevel - leadingClose);
        beautified.push('\t'.repeat(currentLineIndent) + trimmed);

        let netChange = 0;
        for (let i = 0; i < trimmed.length; i++) {
            const c = trimmed[i];
            const next = trimmed[i + 1];

            // 2. Check for C++ Raw String Start
            if (c === 'R' && next === '"') {
                const rawMatch = trimmed.substring(i).match(/^R"([^()]*)\(/);
                if (rawMatch) {
                    const delim = rawMatch[1];
                    const escapedDelim = delim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const closeRegex = new RegExp(`\\)${escapedDelim}"`);
                    const restOfLine = trimmed.substring(i + rawMatch[0].length);
                    const closeMatch = restOfLine.match(closeRegex);
                    
                    if (closeMatch) {
                        // Single line raw string, skip parsing its internals
                        i += rawMatch[0].length + closeMatch[0].length - 1;
                        continue;
                    } else {
                        inCppRawString = true;
                        cppRawStringDelim = delim;
                        cppRawStringLines = [];
                        cppRawStringBaseIndent = currentLineIndent;
                        i += rawMatch[0].length - 1;
                        continue;
                    }
                }
            } 
            
            // 3. Normal JS/C++ Parsing
            let countThisBrace = false;

            if (inString) {
                if (c === stringChar && (i === 0 || trimmed[i - 1] !== '\\')) {
                    inString = false;
                }
                countThisBrace = false; // NEVER count braces inside strings (prevents drift)
            } else if (inMultiComment) {
                if (c === '*' && next === '/') {
                    inMultiComment = false;
                    i++;
                }
                countThisBrace = false; // NEVER count braces inside comments (prevents drift from comment art)
            } else {
                if (c === "'" || c === '"' || c === '`') {
                    inString = true;
                    stringChar = c;
                } else if (c === '/' && next === '/') {
                    break; // rest of line is single-line comment
                } else if (c === '/' && next === '*') {
                    inMultiComment = true;
                    i++;
                }
                countThisBrace = true; // Normal code
            }

            if (countThisBrace) {
                if (c === '{' || c === '[' || c === '(') {
                    netChange++;
                } else if (c === '}' || c === ']' || c === ')') {
                    netChange--;
                }
            }
        }

        indentLevel = Math.max(0, indentLevel + netChange);
    }
    
    // Fallback: Handle unclosed raw string at EOF
    if (inCppRawString && cppRawStringLines.length > 0) {
        let innerIndentStr = '\t'.repeat(cppRawStringBaseIndent + 1);
        for (let innerLine of cppRawStringLines) {
            if (innerLine.trim() === '') beautified.push('');
            else beautified.push(innerIndentStr + innerLine);
        }
    }

    return beautified;
}

// --- 3. HTML Beautifier (Handles <script> and <style> delegation) ---
function beautifyHTML(lines) {
    const voidTags = new Set([
        'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 
        'link', 'meta', 'param', 'source', 'track', 'wbr', '!doctype', '!--'
    ]);
    const inlineTags = new Set([
        'a', 'abbr', 'b', 'bdo', 'big', 'br', 'button', 'cite', 'code', 'dfn', 
        'em', 'i', 'img', 'input', 'kbd', 'label', 'map', 'object', 'output', 
        'q', 'samp', 'select', 'small', 'span', 'strong', 'sub', 'sup', 
        'textarea', 'time', 'tt', 'u', 'var'
    ]);

    let result = [];
    let htmlIndent = 0;
    let inSpecialBlock = false;
    let specialBlockLines = [];
    let specialBlockBaseIndent = 0;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i] ?? '';
        let trimmed = line.trim();

        if (inSpecialBlock) {
            // FIX: Add '^' to ensure we only match if the line STARTS with the closing tag
            let closeTag = inSpecialBlock === 'script' ? /^<\/script>/i : /^<\/style>/i;

            if (closeTag.test(trimmed)) {
                let innerBeautified = beautifyJS(specialBlockLines);
                let innerIndentStr = '\t'.repeat(specialBlockBaseIndent + 1);

                for (let innerLine of innerBeautified) {
                    if (innerLine.trim() === '') result.push('');
                    else result.push(innerIndentStr + innerLine);
                }

                inSpecialBlock = false;
                specialBlockLines = [];
                htmlIndent = Math.max(0, htmlIndent - 1);
                result.push('\t'.repeat(htmlIndent) + trimmed);
            } else {
                specialBlockLines.push(trimmed);
            }
            continue;
        }

        if (trimmed === '') {
            result.push('');
            continue;
        }

        let scriptMatch = trimmed.match(/^<script[^>]*>/i);
        let styleMatch = trimmed.match(/^<style[^>]*>/i);
        
        let tagName = getTagName(trimmed);
        // FIX: Add /\?>$/ to handle PHP/XML tags like <?php ... ?> or <?xml ... ?>
        let isSelfClosing = /\/>$/.test(trimmed) || /\?>$/.test(trimmed) || voidTags.has(tagName);
        let startsWithClose = /^<\//.test(trimmed);
        let isInline = inlineTags.has(tagName);

        if (startsWithClose) {
            htmlIndent = Math.max(0, htmlIndent - 1);
        }

        result.push('\t'.repeat(htmlIndent) + trimmed);

        if (scriptMatch && !/<\/script>/i.test(trimmed)) {
            if (!/\bsrc\s*=/i.test(trimmed)) {
                inSpecialBlock = 'script';
                specialBlockBaseIndent = htmlIndent;
                htmlIndent++;
            }
        } else if (styleMatch && !/<\/style>/i.test(trimmed)) {
            inSpecialBlock = 'style';
            specialBlockBaseIndent = htmlIndent;
            htmlIndent++;
        } 
        else if (!startsWithClose && !isSelfClosing && !isInline) {
            if (tagName && tagName !== '!--') {
                let closeRegex = new RegExp(`</${tagName}>`, 'i');
                if (!closeRegex.test(trimmed)) {
                    htmlIndent++;
                }
            }
        }
    }

    // Handle unclosed special blocks at EOF
    if (inSpecialBlock && specialBlockLines.length > 0) {
        let innerBeautified = beautifyJS(specialBlockLines);
        let innerIndentStr = '\t'.repeat(specialBlockBaseIndent + 1);
        for (let innerLine of innerBeautified) {
            if (innerLine.trim() === '') result.push('');
            else result.push(innerIndentStr + innerLine);
        }
    }

    return result;
}

function getTagName(line) {
    // FIX: Added '?' to safely catch <? tags
    let match = line.match(/^<\/?([a-zA-Z0-9\-!?]+)/);
    return match ? match[1].toLowerCase() : '';
}

// --- 4. Main Execution ---
export function beautifyCode(api) {
    if (_isRunning) return;
    _isRunning = true;

    try {
        const lines = api.editor.getLines();
        const cursor = api.editor.getCursor();

        let beautified;
        
        if (isHTML(lines)) {
            beautified = beautifyHTML(lines);
        } else {
            beautified = beautifyJS(lines);
        }

        api.editor.setLines(beautified, 'beautify');
        
        const maxLine = Math.min(cursor.line, beautified.length - 1);
        const maxCol = beautified[maxLine] ? beautified[maxLine].length : 0;
        const newCol = Math.min(cursor.col, maxCol);
        
        api.editor.setCursor(maxLine, newCol);
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