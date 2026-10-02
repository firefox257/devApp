// ./system/ux/optText/additions/beautifyCodeCore.js
let _isRunning = false;

// --- 1. Detection: Is this HTML or JS/C++? ---
function isHTML(lines) {
    const text = lines.join('\n').slice(0, 2000);
    // Explicit HTML markers
    if (/<!DOCTYPE\s+html/i.test(text)) return true;
    if (/<(html|body|head|template)[\s>]/i.test(text)) return true;
    
    // Heuristic: significantly more HTML tags than curly braces
    const tagCount = (text.match(/<[a-zA-Z0-9\-]+/g) || []).length;
    const braceCount = (text.match(/[{}]/g) || []).length;
    
    return tagCount > 5 && tagCount > braceCount * 2;
}

// --- 2. JS/CSS Beautifier (Reused for <script> and <style> blocks) ---
function beautifyJS(lines) {
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
        
        beautified.push('\t'.repeat(indentLevel) + trimmed);

        for (let i = scanStart; i < trimmed.length; i++) {
            const c = trimmed[i];
            const next = trimmed[i + 1];
            if (inString) {
                if (c === stringChar && (i === 0 || trimmed[i - 1] !== '\\')) inString = false;
            } else if (inMultiComment) {
                if (c === '*' && next === '/') { inMultiComment = false; i++; }
            } else {
                if (c === "'" || c === '"' || c === '`') { inString = true; stringChar = c; }
                else if (c === '/' && next === '/') { break; }
                else if (c === '/' && next === '*') { inMultiComment = true; i++; }
                else if (c === '{' || c === '[' || c === '(') { indentLevel++; }
                else if (c === '}' || c === ']' || c === ')') { indentLevel = Math.max(0, indentLevel - 1); }
            }
        }
        indentLevel = Math.max(0, indentLevel);
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
    let inSpecialBlock = false; // Tracks if we are inside 'script' or 'style'
    let specialBlockLines = [];
    let specialBlockBaseIndent = 0;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let trimmed = line.trim();

        // A. Handle inner JS/CSS blocks
        if (inSpecialBlock) {
            let closeTag = inSpecialBlock === 'script' ? /<\/script>/i : /<\/style>/i;

            if (closeTag.test(trimmed)) {
                // 1. Beautify the collected inner lines using the JS beautifier
                let innerBeautified = beautifyJS(specialBlockLines);
                let innerIndentStr = '\t'.repeat(specialBlockBaseIndent + 1);

                for (let innerLine of innerBeautified) {
                    if (innerLine.trim() === '') result.push('');
                    else result.push(innerIndentStr + innerLine);
                }

                // 2. Reset state
                inSpecialBlock = false;
                specialBlockLines = [];

                // 3. Process the closing tag line as normal HTML
                htmlIndent = Math.max(0, htmlIndent - 1);
                result.push('\t'.repeat(htmlIndent) + trimmed);
            } else {
                // Collect lines inside the special block
                specialBlockLines.push(trimmed);
            }
            continue;
        }

        // B. Normal HTML processing
        if (trimmed === '') {
            result.push('');
            continue;
        }

        let scriptMatch = trimmed.match(/^<script[^>]*>/i);
        let styleMatch = trimmed.match(/^<style[^>]*>/i);
        
        let tagName = getTagName(trimmed);
        let isSelfClosing = /\/>$/.test(trimmed) || voidTags.has(tagName);
        let startsWithClose = /^<\//.test(trimmed);
        let isInline = inlineTags.has(tagName);

        // Dedent if line starts with a closing tag
        if (startsWithClose) {
            htmlIndent = Math.max(0, htmlIndent - 1);
        }

        result.push('\t'.repeat(htmlIndent) + trimmed);

        // Check if we should enter a special block
        if (scriptMatch && !/<\/script>/i.test(trimmed)) {
            inSpecialBlock = 'script';
            specialBlockBaseIndent = htmlIndent;
            htmlIndent++;
        } else if (styleMatch && !/<\/style>/i.test(trimmed)) {
            inSpecialBlock = 'style';
            specialBlockBaseIndent = htmlIndent;
            htmlIndent++;
        } 
        // Otherwise, adjust indent for next line based on HTML block tags
        else if (!startsWithClose && !isSelfClosing && !isInline) {
            if (tagName && tagName !== '!--') {
                let closeRegex = new RegExp(`</${tagName}>`, 'i');
                // If the tag doesn't close on the same line, increase indent
                if (!closeRegex.test(trimmed)) {
                    htmlIndent++;
                }
            }
        }
    }

    // Fallback for unclosed special blocks (malformed HTML)
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
    let match = line.match(/^<\/?([a-zA-Z0-9\-!]+)/);
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
        
        // Route to the appropriate beautifier
        if (isHTML(lines)) {
            beautified = beautifyHTML(lines);
        } else {
            beautified = beautifyJS(lines);
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