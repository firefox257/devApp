// lexer.js
export function tokenize(source) {
    const tokens = [];
    const tokenPatterns = [
        { type: 'COMMENT_LINE', regex: /^\/\/.*/ },
        { type: 'COMMENT_BLOCK', regex: /^\/\*[\s\S]*?\*\// },
        { type: 'STRING_LITERAL', regex: /^'(?:[^'\\]|\\.)*'|^"(?:[^"\\]|\\.)*"/ },
        { type: 'KEYWORD', regex: /^(int8|int16|int32|int64|uint8|uint16|uint32|uint64|float32|float64|bool|char|void|return|print|if|else|while|for|true|false|null|const|class|public|private|protected|export|template|typedef|enum|struct|virtual|volatile|inline|assert|try|catch|throw|new|delete|sizeof|cast|namespace)\b/ },
        { type: 'IDENTIFIER', regex: /^[a-zA-Z_][a-zA-Z0-9_]*/ },
        { type: 'NUMBER', regex: /^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/ },
        
        // FIX: Added '::' to the alternation so it's matched as a single token before ':'
        { type: 'OPERATOR', regex: /^(===|!==|==|!=|<=|>=|&&|\|\||<<=|>>=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<|>>|\+\+|--|->|::|\.\*|->\*|[+\-*/=<>!;{},()\[\].&|^~?:])/ },
        
        { type: 'WHITESPACE', regex: /^\s+/ }
    ];

    let cursor = 0;
    while (cursor < source.length) {
        let matched = false;
        for (const { type, regex } of tokenPatterns) {
            const match = source.slice(cursor).match(regex);
            if (match) {
                const value = match[0];
                if (type !== 'WHITESPACE' && !type.startsWith('COMMENT')) {
                    tokens.push({ type, value });
                }
                cursor += value.length;
                matched = true;
                break;
            }
        }
        if (!matched) {
            throw new Error(`Unexpected character at position ${cursor}: '${source[cursor]}'`);
        }
    }
    return tokens;
}