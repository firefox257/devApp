// ./system/ux/optText/additions/beautifyCodeCore.js
let _isRunning = false;

export function beautifyCode(api) {
    if (_isRunning) return;
    _isRunning = true;

    try {
        const lines = api.editor.getLines();
        const cursor = api.editor.getCursor();

        // Route to the correct formatter based on robust file detection
        if (detectHTML(lines)) {
            beautifyHTMLMode(lines, api, cursor);
        } else {
            beautifyCodeMode(lines, api, cursor);
        }
    } catch (err) {
        console.error('Beautify error:', err);
        api.ui.toast('Beautify failed ❌');
    } finally {
        setTimeout(() => { _isRunning = false; }, 50);
    }
}

// ──────────────────────────────────────────────
//  ROBUST FILE DETECTION
// ──────────────────────────────────────────────
function detectHTML(lines) {
    const head = lines.slice(0, 50).join('\n');
    
    // 1. Strong Code Indicators (If found, it's definitely NOT a pure HTML file)
    if (/^\s*#(include|define|import|pragma|if|endif|else|elif)\b/m.test(head)) return false;
    if (/\b(std::|cout|cin|endl|printf|scanf|namespace|template|typename)\b/.test(head)) return false;
    if (/R"[\(\[]/.test(head)) return false; // C++11 raw string literal
    if (/\b(int|void|char|float|double|bool|auto|String)\s+main\s*\(/m.test(head)) return false;
    if (/\b(using\s+namespace|namespace\s+\w+)\b/m.test(head)) return false;
    if (/\b(public|private|protected)\s+(class|struct|void|int|static)\b/m.test(head)) return false;
    if (/^\s*(import|package)\s+[\w.]+;/m.test(head)) return false;
    
    // Check the very first non-empty line for code starters
    let firstLine = '';
    for (const line of lines) {
        if (line.trim() !== '') { firstLine = line.trim(); break; }
    }
    if (/^(import |package |using |namespace |const |let |var |function |export |from |def |<?php)/.test(firstLine)) return false;

    // 2. Strong HTML Indicators
    if (/<!DOCTYPE\s+html/i.test(head)) return true;
    if (/<html[\s>]/i.test(head)) return true;
    
    // 3. Weak HTML Indicators (Tag counting, but only if code keywords are low)
    const htmlTags = (head.match(/<(div|span|body|head|section|article|nav|header|footer|main|form|table|ul|ol|script|style|p|h[1-6]|li|a|button|input|select|textarea)\b/gi) || []).length;
    const codeKeywords = (head.match(/\b(if|else|for|while|return|function|class|int|void|const|let|var|import|include|using|namespace|def|print)\b/g) || []).length;
    
    if (htmlTags >= 3 && codeKeywords < 2) return true;
    
    return false;
}

// ──────────────────────────────────────────────
//  SHARED HELPERS
// ──────────────────────────────────────────────
function applyResult(beautified, api, cursor) {
    api.editor.setLines(beautified, 'beautify');
    const maxLine = Math.max(0, beautified.length - 1);
    const safeLine = Math.min(cursor.line, maxLine);
    const safeCol = Math.min(cursor.col, beautified[safeLine].length);
    api.editor.setCursor(safeLine, safeCol);
    api.editor.scrollToCursor();
    api.ui.toast('Code beautified ✨');
}

function countBackslashes(str, i) {
    let n = 0;
    for (let j = i - 1; j >= 0 && str[j] === '\\'; j--) n++;
    return n;
}

// ──────────────────────────────────────────────
//  CODE MODE  (JS · C++ · C · Java · etc.)
// ──────────────────────────────────────────────
function beautifyCodeMode(lines, api, cursor) {
    let indentLevel = 0;
    const out = [];
    let inString = false;
    let stringChar = '';
    let inMultiComment = false;

    for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (trimmed === '') { out.push(''); continue; }

        let cur = indentLevel;
        if (!inString && !inMultiComment && /^[})\]]/.test(trimmed)) {
            cur = Math.max(0, cur - 1);
        }

        // CRITICAL: Preserve raw content inside strings / block comments
        if (inString || inMultiComment) {
            out.push(rawLine);
        } else {
            out.push('\t'.repeat(cur) + trimmed);
        }

        // Scan to update state for subsequent lines
        for (let i = 0; i < trimmed.length; i++) {
            const c = trimmed[i], nx = trimmed[i + 1];

            if (inString) {
                if (c === stringChar && countBackslashes(trimmed, i) % 2 === 0) {
                    inString = false;
                }
            } else if (inMultiComment) {
                if (c === '*' && nx === '/') { inMultiComment = false; i++; }
            } else {
                if (c === "'" || c === '"' || c === '`') {
                    inString = true; stringChar = c;
                } else if (c === '/' && nx === '/') {
                    break;
                } else if (c === '/' && nx === '*') {
                    inMultiComment = true; i++;
                } else if (c === '{' || c === '[' || c === '(') {
                    indentLevel++;
                } else if (c === '}' || c === ']' || c === ')') {
                    indentLevel = Math.max(0, indentLevel - 1);
                }
            }
        }
    }

    applyResult(out, api, cursor);
}

// ──────────────────────────────────────────────
//  HTML MODE  (with <script> JS beautification)
// ──────────────────────────────────────────────
function beautifyHTMLMode(lines, api, cursor) {
    let htmlIndent = 0;
    let jsIndent = 0;
    const out = [];
    let inScript = false;
    let inString = false;
    let stringChar = '';
    let inMultiComment = false;

    const voidTags = new Set([
        'area','base','br','col','embed','hr','img','input',
        'link','meta','param','source','track','wbr','!doctype'
    ]);

    for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (trimmed === '') { out.push(''); continue; }

        // ── Exit <script> ──
        if (inScript && /<\/script\s*>/i.test(trimmed)) {
            inScript = false;
            htmlIndent = Math.max(0, htmlIndent - 1);
            out.push('\t'.repeat(htmlIndent) + trimmed);
            continue;
        }

        // ── JS inside <script> ──
        if (inScript) {
            if (inString || inMultiComment) {
                out.push(rawLine);
            } else {
                let cur = jsIndent;
                if (/^[})\]]/.test(trimmed)) cur = Math.max(0, cur - 1);
                out.push('\t'.repeat(htmlIndent + cur) + trimmed);
            }

            for (let i = 0; i < trimmed.length; i++) {
                const c = trimmed[i], nx = trimmed[i + 1];
                if (inString) {
                    if (c === stringChar && countBackslashes(trimmed, i) % 2 === 0) inString = false;
                } else if (inMultiComment) {
                    if (c === '*' && nx === '/') { inMultiComment = false; i++; }
                } else {
                    if (c === "'" || c === '"' || c === '`') { inString = true; stringChar = c; }
                    else if (c === '/' && nx === '/') { break; }
                    else if (c === '/' && nx === '*') { inMultiComment = true; i++; }
                    else if (c === '{' || c === '[' || c === '(') { jsIndent++; }
                    else if (c === '}' || c === ']' || c === ')') { jsIndent = Math.max(0, jsIndent - 1); }
                }
            }
            continue;
        }

        // ── HTML Mode: Preserve raw lines if inside a string or multi-line comment ──
        if (inString || inMultiComment) {
            out.push(rawLine);
            for (let i = 0; i < trimmed.length; i++) {
                const c = trimmed[i], nx = trimmed[i + 1];
                if (inString) {
                    if (c === stringChar && countBackslashes(trimmed, i) % 2 === 0) inString = false;
                } else if (inMultiComment) {
                    if (c === '*' && nx === '/') { inMultiComment = false; i++; }
                } else {
                    if (c === "'" || c === '"' || c === '`') { inString = true; stringChar = c; }
                    else if (c === '/' && nx === '/') { break; }
                    else if (c === '/' && nx === '*') { inMultiComment = true; i++; }
                }
            }
            continue;
        }

        // ── Standard HTML Formatting ──
        const isClosing = /^<\//.test(trimmed);
        const tagMatch = trimmed.match(/^<\/?([a-zA-Z0-9\-]+)/);
        const tagName = tagMatch ? tagMatch[1].toLowerCase() : '';
        const isVoid = voidTags.has(tagName) || /\/\s*>$/.test(trimmed);
        const willEnterScript = /<script\b/i.test(trimmed) && !/<\/script\s*>/i.test(trimmed);

        let cur = htmlIndent;
        if (isClosing) cur = Math.max(0, htmlIndent - 1);
        out.push('\t'.repeat(cur) + trimmed);

        if (isClosing) {
            htmlIndent = Math.max(0, htmlIndent - 1);
        } else if (!isVoid && /^</.test(trimmed)) {
            htmlIndent++;
        }

        if (willEnterScript) { inScript = true; jsIndent = 0; }
    }

    applyResult(out, api, cursor);
}