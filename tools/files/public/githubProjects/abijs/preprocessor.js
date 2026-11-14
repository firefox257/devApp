// =============================================================================
// ABI.js PREPROCESSOR (preprocessor.js)
// Isomorphic: Runs in Node.js and Browser
// Features: Shared context across multiple <# #> blocks, preserves line numbers.
// =============================================================================

function preprocess(source) {
    const tokens = {};
    let preprocessorJS = "";
    
    // 1. Extract all <# ... #> blocks and concatenate their JS code.
    // We replace the blocks with an equivalent number of newlines to preserve 
    // the line numbers for the actual ABI.js code (helps with compiler error reporting).
    let processedSource = source.replace(/<#([\s\S]*?)#>/g, (match, jsCode) => {
        preprocessorJS += jsCode + "\n";
        const newlines = '\n'.repeat(jsCode.split('\n').length - 1);
        return newlines; 
    });

    // 2. Execute the concatenated JS code in a SINGLE shared context.
    if (preprocessorJS.trim().length > 0) {
        try {
            // By passing all JS into one `new Function`, any variables/functions 
            // declared with `let`, `const`, `var`, or `function` are scoped to 
            // this execution context and shared across all original blocks!
            const executeContext = new Function('tokens', preprocessorJS);
            executeContext(tokens);
        } catch (e) {
            throw new Error(`Preprocessor execution error: ${e.message}\n\nPreprocessor Code:\n${preprocessorJS}`);
        }
    }

    // 3. Tokenize the remaining source to find and replace tokens.
    let result = '';
    let i = 0;
    
    while (i < processedSource.length) {
        const c = processedSource[i];
        
        // Skip strings (don't replace tokens inside strings)
        if (c === '"' || c === "'") {
            const quote = c;
            let str = c; i++;
            while (i < processedSource.length && processedSource[i] !== quote) {
                if (processedSource[i] === '\\') { str += processedSource[i] + (processedSource[i+1] || ''); i += 2; } 
                else { str += processedSource[i]; i++; }
            }
            if (i < processedSource.length) { str += processedSource[i]; i++; }
            result += str; continue;
        }
        
        // Skip comments
        if (c === '/' && processedSource[i+1] === '/') {
            while (i < processedSource.length && processedSource[i] !== '\n') { result += processedSource[i]; i++; }
            continue;
        }
        if (c === '/' && processedSource[i+1] === '*') {
            result += '/*'; i += 2;
            while (i < processedSource.length - 1 && !(processedSource[i] === '*' && processedSource[i+1] === '/')) { result += processedSource[i]; i++; }
            if (i < processedSource.length - 1) { result += '*/'; i += 2; }
            continue;
        }

        // Identify words (identifiers)
        if (/[a-zA-Z_]/.test(c)) {
            let word = '';
            while (i < processedSource.length && /[a-zA-Z0-9_]/.test(processedSource[i])) { word += processedSource[i]; i++; }
            
            if (tokens[word] !== undefined) {
                // Look ahead for '(' to check if it's a function call
                let j = i;
                while (j < processedSource.length && /\s/.test(processedSource[j])) j++;
                
                if (processedSource[j] === '(' && typeof tokens[word] === 'function') {
                    // It's a macro function call. Parse arguments.
                    j++; // skip '('
                    let args = [], currentArg = '', depth = 1;
                    while (j < processedSource.length && depth > 0) {
                        const ch = processedSource[j];
                        if (ch === '(') depth++;
                        else if (ch === ')') { depth--; if (depth === 0) { args.push(currentArg.trim()); break; } }
                        else if (ch === ',' && depth === 1) { args.push(currentArg.trim()); currentArg = ''; j++; continue; }
                        currentArg += ch; j++;
                    }
                    // Call the macro function with the parsed string arguments
                    try {
                        const expanded = tokens[word](...args);
                        result += typeof expanded === 'string' ? expanded : String(expanded);
                    } catch (e) {
                        throw new Error(`Preprocessor error calling macro '${word}': ${e.message}`);
                    }
                    i = j + 1; // skip past the ')'
                } else if (typeof tokens[word] === 'string') {
                    // Simple string macro
                    result += tokens[word];
                } else {
                    result += word; // Fallback if token is neither string nor function
                }
            } else {
                result += word;
            }
            continue;
        }
        
        result += c; i++;
    }
    
    return result;
}

// Isomorphic Exports
if (typeof module !== 'undefined' && module.exports) module.exports = { preprocess };
if (typeof window !== 'undefined') window.abijs_preprocessor = { preprocess };